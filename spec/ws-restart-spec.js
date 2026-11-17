const WSKernel = require("../lib/ws-kernel");
const { ServerConnection } = require("@jupyterlab/services");

function signal() {
  const listeners = new Set();
  return {
    connect: (callback) => listeners.add(callback),
    disconnect: (callback) => listeners.delete(callback),
    emit: (sender, value) => {
      for (const callback of [...listeners]) callback(sender, value);
    },
  };
}

function response(body, status = 200) {
  return Promise.resolve({ status, json: () => Promise.resolve(body) });
}

function controlledGateway() {
  const probes = [];
  const sessions = [];
  const kernelModel = { id: "remote-kernel", name: "python3" };
  const model = {
    id: "remote-session",
    kernel: kernelModel,
    path: "test.ipynb",
    name: "Test",
    type: "notebook",
  };
  const restart = jasmine.createSpy("restart REST").and.callFake(() => response(kernelModel));
  const getSession = jasmine.createSpy("get session").and.callFake(() => response(model));
  const shutdown = jasmine.createSpy("shutdown REST").and.callFake(() => response(null, 204));
  const settings = ServerConnection.makeSettings({
    baseUrl: "https://controlled-gateway.invalid/",
    fetch: (request) => {
      if (request.method === "POST") return restart(request);
      if (request.method === "GET") return getSession(request);
      if (request.method === "DELETE") return shutdown(request);
      throw new Error("Unexpected gateway request");
    },
  });

  function connect() {
    const targets = new Map();
    const remote = {
      ...kernelModel,
      serverSettings: settings,
      clientId: "client-" + sessions.length,
      username: "test",
      status: "idle",
      connectionStatus: "connected",
      statusChanged: signal(),
      connectionStatusChanged: signal(),
      iopubMessage: signal(),
      targets,
      registerCommTarget(name, handler) {
        targets.set(name, handler);
      },
      removeCommTarget(name, handler) {
        if (targets.get(name) === handler) targets.delete(name);
      },
      requestExecute: jasmine.createSpy("requestExecute"),
      requestComplete: jasmine.createSpy("requestComplete"),
      sendShellMessage: jasmine.createSpy("sendShellMessage").and.callFake((message) => {
        const result = Promise.withResolvers();
        const probe = {
          message,
          done: result.promise,
          reply: () =>
            result.resolve({
              header: { msg_type: "kernel_info_reply" },
              parent_header: message.header,
              content: { status: "ok", language_info: { name: "python", version: "3.14" } },
            }),
          dispose: jasmine.createSpy("dispose readiness future"),
        };
        probes.push(probe);
        return probe;
      }),
      setStatus(status) {
        this.status = status;
        this.statusChanged.emit(this, status);
      },
      setConnectionStatus(status) {
        this.connectionStatus = status;
        this.connectionStatusChanged.emit(this, status);
      },
    };
    const session = {
      id: model.id,
      model,
      serverSettings: settings,
      kernel: remote,
      kernelChanged: signal(),
      dispose: jasmine.createSpy("dispose session"),
    };
    sessions.push(session);
    return session;
  }

  const session = connect();
  const manager = {
    connectTo: jasmine.createSpy("attach to session").and.callFake(connect),
    dispose: jasmine.createSpy("dispose session manager"),
  };
  const transport = new WSKernel(
    "test gateway",
    { display_name: "Python", language: "python" },
    null,
    session,
    { sessionManager: manager },
  );
  return { transport, session, sessions, probes, model, manager, restart, getSession, shutdown };
}

async function flushMicrotasks() {
  for (let turn = 0; turn < 28; turn++) await Promise.resolve();
}

describe("WebSocket kernel restart", () => {
  let gateway, transport, remote, probes, session;

  beforeEach(() => {
    gateway = controlledGateway();
    ({ transport, probes, session } = gateway);
    remote = session.kernel;
  });

  afterEach(async () => {
    transport.destroy();
    await flushMicrotasks();
  });

  it("coalesces restarts and opens readiness for the fresh client only after its probe", async () => {
    transport.setExecutionCount(4);
    transport.setLastExecutionTime("10s");
    const reset = jasmine.createSpy("reset");
    const reentered = [];
    transport.onDidResetComms(reset);
    transport.onDidChangeLifecycle((state) => {
      if (state === "ready") reentered.push(transport.restart());
    });

    const first = transport.restart();
    expect(transport.restart()).toBe(first);
    await flushMicrotasks();
    expect(transport.lifecycle).toBe("restarting");
    expect(transport.executionCount).toBe(0);
    expect(transport.lastExecutionTime).toBe("No execution");
    expect(gateway.restart).toHaveBeenCalledTimes(1);
    expect(gateway.manager.connectTo).toHaveBeenCalledOnceWith({
      model: gateway.model,
      kernelConnectionOptions: { handleComms: true },
    });
    const replacement = transport.session;
    expect(replacement.id).toBe(session.id);
    expect(replacement.kernel.id).toBe(remote.id);
    expect(replacement.kernel.clientId).not.toBe(remote.clientId);
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(replacement.kernel.sendShellMessage).toHaveBeenCalledWith(probes[0].message, true);
    expect(probes[0].message.header.msg_type).toBe("kernel_info_request");
    expect(probes[0].message.header.session).toBe(replacement.kernel.clientId);

    replacement.kernel.setStatus("idle");
    remote.setStatus("dead");
    const blockedExecution = jasmine.createSpy("blocked execution");
    const blockedCompletion = jasmine.createSpy("blocked completion");
    transport.execute("1 + 1", blockedExecution);
    transport.complete("abc", blockedCompletion);
    expect(replacement.kernel.requestExecute).not.toHaveBeenCalled();
    expect(replacement.kernel.requestComplete).not.toHaveBeenCalled();
    expect(blockedExecution.calls.first().args[0].content.ename).toBe("KernelUnresponsive");
    expect(blockedCompletion.calls.first().args[0].content.ename).toBe("KernelUnresponsive");

    probes[0].reply();
    expect(await first).toBe(true);
    expect(reentered).toEqual([first]);
    expect(transport.lifecycle).toBe("ready");
    expect(transport.languageInfo).toEqual({ name: "python", version: "3.14" });
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("retires the old generation once for an externally triggered restart", async () => {
    const results = [];
    const future = {
      msg: { header: { msg_id: "old-execution" } },
      done: new Promise(() => {}),
      dispose: jasmine.createSpy("dispose execution"),
    };
    remote.requestExecute.and.returnValue(future);
    remote.requestComplete.and.returnValue(new Promise(() => {}));
    transport.execute("old()", (message) => results.push(message.content.ename));
    transport.complete("old", (message) => results.push(message.content.ename));
    const resultsWhenReset = [];
    transport.onDidResetComms(() => resultsWhenReset.push([...results]));

    remote.setStatus("restarting");
    remote.setStatus("autorestarting");
    remote.setConnectionStatus("connecting");
    await flushMicrotasks();
    expect(probes.length).toBe(0);
    expect(future.dispose).toHaveBeenCalledTimes(1);
    expect(resultsWhenReset).toEqual([
      ["ExecutionOutcomeUnknown", "ExecutionOutcomeUnknown", undefined, "KernelUnresponsive"],
    ]);
    const restarted = transport.restart();
    remote.setConnectionStatus("connected");
    remote.setStatus("idle");
    await flushMicrotasks();
    expect(probes.length).toBe(1);
    expect(transport.lifecycle).toBe("restarting");
    expect(gateway.restart).not.toHaveBeenCalled();
    expect(gateway.manager.connectTo).toHaveBeenCalledTimes(1);
    probes[0].reply();
    expect(await restarted).toBe(true);
  });

  it("retains comm target claims while rejecting callbacks from the previous client", async () => {
    const joined = jasmine.createSpy("joined comm");
    const claim = transport.registerCommTarget("test", joined);
    const previous = remote.targets.get("test");
    const restarted = transport.restart();
    await flushMicrotasks();
    probes[0].reply();
    expect(await restarted).toBe(true);

    const targets = transport.session.kernel.targets;
    expect(targets.has("test")).toBe(true);
    previous({ commId: "old", targetName: "test" }, {});
    expect(joined).not.toHaveBeenCalled();
    targets.get("test")({ commId: "new", targetName: "test" }, {});
    expect(joined).toHaveBeenCalledTimes(1);
    claim.dispose();
    expect(targets.has("test")).toBe(false);
  });

  it("disposes an unanswered probe and retries with a fresh request id", async () => {
    const restarted = transport.restart();
    await flushMicrotasks();
    window.advanceClock(WSKernel.PROBE_TIMEOUT_MS);
    await flushMicrotasks();
    expect(probes.length).toBe(2);
    expect(probes[0].dispose).toHaveBeenCalledTimes(1);
    expect(probes[0].message.header.msg_id).not.toBe(probes[1].message.header.msg_id);

    probes[0].reply();
    await flushMicrotasks();
    expect(transport.lifecycle).toBe("restarting");
    probes[1].reply();
    expect(await restarted).toBe(true);
  });

  it("closes the readiness future on disconnect and ignores its late completion", async () => {
    const reset = jasmine.createSpy("reset");
    transport.onDidResetComms(reset);
    const restarted = transport.restart();
    await flushMicrotasks();
    transport.session.kernel.setConnectionStatus("disconnected");

    expect(await restarted).toBe(false);
    expect(probes[0].dispose).toHaveBeenCalledTimes(1);
    probes[0].reply();
    await flushMicrotasks();
    expect(transport.lifecycle).toBe("dead");
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung REST restart at the deadline and releases the attachment", async () => {
    spyOn(lumine.notifications, "addError");
    const pending = Promise.withResolvers();
    gateway.restart.and.returnValue(pending.promise);
    const lost = jasmine.createSpy("kernel lost");
    transport.onDidLoseKernel(lost);
    const restarted = transport.restart();
    await flushMicrotasks();
    const request = gateway.restart.calls.first().args[0];
    expect(new URL(request.url).pathname).toBe("/api/kernels/remote-kernel/restart");
    expect(request.signal.aborted).toBe(false);
    window.advanceClock(WSKernel.RESTART_TIMEOUT_MS);
    expect(await restarted).toBe(false);
    expect(request.signal.aborted).toBe(true);
    expect(transport.lifecycle).toBe("dead");
    expect(lost).toHaveBeenCalledOnceWith("The kernel did not become ready after restarting.", {
      detach: true,
    });
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(gateway.manager.dispose).toHaveBeenCalledTimes(1);
    expect(await transport.restart()).toBe(false);
    expect(gateway.restart).toHaveBeenCalledTimes(1);
    expect(lumine.notifications.addError).toHaveBeenCalledTimes(1);

    pending.resolve({ status: 200, json: async () => gateway.model.kernel });
    await flushMicrotasks();
    expect(gateway.manager.connectTo).not.toHaveBeenCalled();
    expect(transport.lifecycle).toBe("dead");
  });

  it("allows a new restart after the new client's handshake times out", async () => {
    spyOn(lumine.notifications, "addError");
    const restarted = transport.restart();
    await flushMicrotasks();
    const replacement = transport.session;
    window.advanceClock(WSKernel.RESTART_TIMEOUT_MS);
    expect(await restarted).toBe(false);
    expect(transport.lifecycle).toBe("unresponsive");
    expect(transport.canRestart).toBe(true);
    expect(probes[0].dispose).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).not.toHaveBeenCalled();

    const retry = transport.restart();
    await flushMicrotasks();
    expect(gateway.restart).toHaveBeenCalledTimes(2);
    expect(gateway.sessions.length).toBe(3);
    probes[1].reply();
    expect(await retry).toBe(true);
  });

  it("does not bind a different kernel if the remote session is reassigned during restart", async () => {
    const lost = jasmine.createSpy("kernel lost");
    transport.onDidLoseKernel(lost);
    gateway.getSession.and.callFake(() =>
      response({ ...gateway.model, kernel: { ...gateway.model.kernel, id: "other-kernel" } }),
    );
    expect(await transport.restart()).toBe(false);
    expect(lost).toHaveBeenCalledOnceWith("The session's kernel changed", { detach: true });
    expect(gateway.manager.connectTo).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("detaches if the server replaces the fresh client during readiness", async () => {
    const lost = jasmine.createSpy("kernel lost");
    transport.onDidLoseKernel(lost);
    const restarted = transport.restart();
    await flushMicrotasks();
    const replacement = transport.session;
    replacement.kernel = {};
    replacement.kernelChanged.emit(replacement, {});
    expect(await restarted).toBe(false);
    expect(lost).toHaveBeenCalledOnceWith("The session's kernel changed", { detach: true });
    expect(probes[0].dispose).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
  });

  it("can shut down the remote session while the REST restart is pending", async () => {
    gateway.restart.and.returnValue(new Promise(() => {}));
    const restarted = transport.restart();
    await flushMicrotasks();
    await transport.shutdown();
    expect(await restarted).toBe(false);
    expect(gateway.restart.calls.first().args[0].signal.aborted).toBe(true);
    expect(gateway.shutdown).toHaveBeenCalledTimes(1);
    expect(new URL(gateway.shutdown.calls.first().args[0].url).pathname).toBe(
      "/api/sessions/remote-session",
    );
  });

  it("does not start a gateway operation after a status listener destroys the session", async () => {
    transport.onDidChangeExecutionState((state) => {
      if (state === "restarting") transport.destroy();
    });
    expect(await transport.restart()).toBe(false);
    expect(gateway.restart).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });

  it("cancels pending readiness when the session is destroyed", async () => {
    const restarted = transport.restart();
    await flushMicrotasks();
    const replacement = transport.session;
    transport.destroy();
    expect(await restarted).toBe(false);
    expect(probes[0].dispose).toHaveBeenCalledTimes(1);
    expect(replacement.dispose).toHaveBeenCalledTimes(1);
    probes[0].reply();
    await flushMicrotasks();
    expect(transport.lifecycle).toBe("dead");
  });
});
