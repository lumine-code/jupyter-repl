describe("Node fetch renderer compatibility", () => {
  it("loads standard Node Request, Headers, Response and streaming bodies without mutating Performance", async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "performance");
    const { Request, Headers, Response } = require("node-fetch");
    const { Readable } = require("node:stream");
    const request = new Request("https://controlled-gateway.invalid/", {
      method: "POST",
      headers: new Headers({ Cookie: "scratch=1" }),
      body: "body",
    });
    expect(request.headers.get("Cookie")).toBe("scratch=1");
    expect(await request.text()).toBe("body");
    const response = new Response(Readable.from([Buffer.from([0, 255])]));
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 255]);
    expect(Object.getOwnPropertyDescriptor(globalThis, "performance")).toEqual(original);
  });
});
