const http = require("node:http");
const https = require("node:https");
const { Writable, Readable } = require("node:stream");

describe("Gateway cookie standard transport", () => {
  let picker, ServerConnection, nodeFetch, responses, requests;
  const origin = "https://controlled-gateway.invalid";
  beforeEach(async () => {
    responses = [];
    requests = [];
    // Every native request/agent boundary is replaced before activation.
    // The mock emits real Node response streams without creating any socket.
    for (const library of [http, https]) {
      spyOn(library.globalAgent, "addRequest").and.stub();
      spyOn(library, "get").and.callFake(() => {
        throw new Error("Unexpected gateway reachability request");
      });
      spyOn(library, "request").and.callFake((url, options) => {
        const headers = new Map(
          Object.entries(options.headers).map(([name, value]) => [
            name.toLowerCase(),
            Array.isArray(value) ? value.join(", ") : value,
          ]),
        );
        const chunks = [];
        const record = { url, options, headers, chunks };
        const request = new Writable({
          write(chunk, encoding, callback) {
            chunks.push(Buffer.from(chunk));
            callback();
          },
          final(callback) {
            callback();
            queueMicrotask(() => {
              const reply = responses.shift();
              if (!reply) {
                request.emit("error", new Error("Unexpected controlled gateway request"));
                return;
              }
              const response = Readable.from([Buffer.from(reply.body || "")]);
              response.statusCode = reply.status || 200;
              response.statusMessage = "Controlled";
              response.headers = reply.headers || {};
              response.rawHeaders = Object.entries(response.headers).flat();
              request.emit("response", response);
            });
          },
        });
        record.request = request;
        requests.push(record);
        request.abort = () => request.destroy();
        request.setTimeout = () => request;
        request.getHeader = (name) => headers.get(name.toLowerCase());
        request.removeHeader = (name) => headers.delete(name.toLowerCase());
        options.agent?.addRequest(request, options);
        return request;
      });
    }
    await lumine.packages.activatePackage("jupyter-repl");
    const WSKernelPicker = require("../lib/ws-kernel-picker");
    ({ ServerConnection } = require("@jupyterlab/services"));
    nodeFetch = require("node-fetch");
    picker = new WSKernelPicker(() => {});
    spyOn(picker, "loadSessions").and.resolveTo();
  });
  afterEach(async () => {
    picker.destroy();
    for (const { request } of requests) request.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  async function cookieSettings(extra = {}) {
    const flow = picker._beginFlow(null, { filePath: "controlled.py" });
    flow.gatewayOptions = { baseUrl: `${origin}/`, ...extra };
    flow.credentialKind = "cookie";
    await picker.onCredential("scratch=1; _xsrf=scratch-xsrf");
    return ServerConnection.makeSettings(flow.gatewayOptions);
  }
  function isNodeSettings(settings) {
    const matches =
      settings.Request === nodeFetch.Request ||
      settings.Request.prototype instanceof nodeFetch.Request;
    expect(matches).toBe(true);
    // Even the original failure cannot fall through to renderer fetch.
    return matches;
  }
  it("sends Cookie and XSRF through actual SDK POST and preserves binary response", async () => {
    const settings = await cookieSettings({ init: { headers: { "X-Custom": "kept" } } });
    if (!isNodeSettings(settings)) return;
    responses.push({ body: Buffer.from([0, 1, 255]) });
    const response = await ServerConnection.makeRequest(
      `${origin}/api/sessions`,
      { method: "POST", body: '{"name":"controlled"}' },
      settings,
    );
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 1, 255]);
    expect(requests[0].headers.get("cookie")).toBe("scratch=1; _xsrf=scratch-xsrf");
    expect(requests[0].headers.get("x-xsrftoken")).toBe("scratch-xsrf");
    expect(requests[0].headers.get("x-custom")).toBe("kept");
    expect(Buffer.concat(requests[0].chunks).toString()).toBe('{"name":"controlled"}');
  });
  it("keeps Cookie authentication when an SDK call supplies its own headers", async () => {
    const settings = await cookieSettings();
    if (!isNodeSettings(settings)) return;
    responses.push({ body: "ok" });
    const response = await ServerConnection.makeRequest(
      `${origin}/api/contents`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array([0, 255]),
      },
      settings,
    );
    expect(await response.text()).toBe("ok");
    expect(requests[0].headers.get("cookie")).toBe("scratch=1; _xsrf=scratch-xsrf");
    expect(requests[0].headers.get("x-xsrftoken")).toBe("scratch-xsrf");
    expect(requests[0].headers.get("content-type")).toBe("application/octet-stream");
  });
  for (const sameOrigin of [true, false]) {
    it(`${sameOrigin ? "preserves" : "removes"} gateway credentials on ${sameOrigin ? "same" : "other"}-origin redirect`, async () => {
      const settings = await cookieSettings({ token: "scratch-token" });
      if (!isNodeSettings(settings)) return;
      responses.push(
        {
          status: 302,
          headers: {
            location: `${sameOrigin ? origin : "https://other-controlled.invalid"}/redirected`,
          },
        },
        { body: "redirected" },
      );
      const response = await ServerConnection.makeRequest(
        `${origin}/api/kernelspecs`,
        { method: "GET" },
        settings,
      );
      expect(await response.text()).toBe("redirected");
      expect(requests.length).toBe(2);
      for (const [name, value] of [
        ["cookie", "scratch=1; _xsrf=scratch-xsrf"],
        ["x-xsrftoken", "scratch-xsrf"],
        ["authorization", "token scratch-token"],
      ]) {
        expect(requests[1].headers.get(name)).toBe(sameOrigin ? value : undefined);
      }
    });
  }
  it("honors an aborted SDK request without dispatching network work", async () => {
    const settings = await cookieSettings();
    if (!isNodeSettings(settings)) return;
    const controller = new AbortController();
    controller.abort();
    await expectAsync(
      ServerConnection.makeRequest(
        `${origin}/api/kernelspecs`,
        { method: "GET", signal: controller.signal },
        settings,
      ),
    ).toBeRejected();
    expect(requests).toEqual([]);
  });
  it("passes Cookie to the modern SDK WebSocket constructor without opening a socket", async () => {
    const Socket = jasmine.createSpy("controlled socket constructor");
    const settings = await cookieSettings({ WebSocket: Socket });
    new settings.WebSocket(
      "wss://controlled-gateway.invalid/api/kernels/id/channels",
      "controlled-protocol",
    );
    expect(Socket).toHaveBeenCalledWith(
      "wss://controlled-gateway.invalid/api/kernels/id/channels",
      "controlled-protocol",
      {
        headers: { Cookie: "scratch=1; _xsrf=scratch-xsrf" },
        origin,
        host: "controlled-gateway.invalid",
      },
    );
  });
  it("preserves token and no-credential settings without replacing their transports", async () => {
    for (const kind of ["token", "none"]) {
      const customFetch = jasmine.createSpy("custom fetch");
      const Socket = jasmine.createSpy("custom socket");
      const flow = picker._beginFlow(null, { filePath: "controlled.py" });
      flow.gatewayOptions = { baseUrl: `${origin}/`, fetch: customFetch, WebSocket: Socket };
      flow.credentialKind = kind;
      if (kind === "token") await picker.onCredential("scratch-token");
      else await picker.finishAuth(flow);
      const settings = ServerConnection.makeSettings(flow.gatewayOptions);
      expect(settings.fetch).toBe(customFetch);
      expect(settings.WebSocket).toBe(Socket);
      expect(settings.token).toBe(kind === "token" ? "scratch-token" : "");
    }
  });
  for (const kind of ["web-stream", "form-data"]) {
    it(`preserves ${kind} SDK request bodies through the private Node Request`, async () => {
      const settings = await cookieSettings();
      if (!isNodeSettings(settings)) return;
      let body;
      if (kind === "web-stream")
        body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([0, 255]));
            controller.close();
          },
        });
      else {
        body = new FormData();
        body.append("field", "controlled-value");
      }
      responses.push({ body: "ok" });
      const response = await ServerConnection.makeRequest(
        `${origin}/api/contents`,
        { method: "PUT", body },
        settings,
      );
      expect(await response.text()).toBe("ok");
      const sent = Buffer.concat(requests[0].chunks);
      if (kind === "web-stream") expect(Array.from(sent)).toEqual([0, 255]);
      else expect(sent.toString()).toContain("controlled-value");
    });
  }
});
