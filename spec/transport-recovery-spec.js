const ZMQKernel = require("../lib/zmq-kernel");
const Kernel = require("../lib/kernel");
const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

const SESSION = "11111111-1111-1111-1111-111111111111";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settleMicrotasks() {
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
}

function fakeSocket() {
  return {
    sent: [],
    listeners: new Map(),
    closed: false,
    connect() {},
    on(event, callback) {
      const callbacks = this.listeners.get(event) || [];
      callbacks.push(callback);
      this.listeners.set(event, callbacks);
      return this;
    },
    emit(event, value) {
      for (const callback of [...(this.listeners.get(event) || [])]) callback(value);
    },
    removeAllListeners() {
      this.listeners.clear();
    },
    close() {
      this.closed = true;
    },
    async send(message, isStale = null) {
      if (!isStale?.()) this.sent.push(message);
    },
  };
}

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel.sessionId = SESSION;
  kernel.kernelSpec = { display_name: "Python 3" };
  kernel.displayName = "Python 3";
  kernel.connection = {
    signature_scheme: "hmac-sha256",
    key: "secret",
    transport: "tcp",
    ip: "127.0.0.1",
    shell_port: 12345,
  };
  kernel.executionCallbacks = {};
  kernel._shellQueue = [];
  kernel._activeShellRequest = null;
  kernel._connectionGeneration = 1;
  kernel._quarantinedRequestIds = new Set();
  kernel._readyProbeIds = new Set();
  kernel._reportedExecutionState = "idle";
  kernel._reportedIdleSince = Date.now();
  kernel._reportedStatusParent = null;
  kernel.shellSocket = fakeSocket();
  kernel.states = [];
  kernel.setExecutionState = function (state) {
    this.executionState = state;
    this.states.push(state);
  };
  kernel.setExecutionCount = () => {};
  kernel.setExecutionStartTime = () => {};
  kernel.setLastExecutionTime = () => {};
  kernel.recoverySockets = [];
  kernel._createRecoverySocket = () => {
    const socket = fakeSocket();
    kernel.recoverySockets.push(socket);
    return socket;
  };
  return kernel;
}

function status(requestId, state, requestType = "execute_request", session = SESSION) {
  return {
    header: { msg_id: `${requestId}_${state}`, msg_type: "status" },
    parent_header: { session, msg_id: requestId, msg_type: requestType },
    content: { execution_state: state },
  };
}

function reply(requestId, requestType = "execute_request", session = SESSION) {
  return {
    header: {
      msg_id: `${requestId}_reply`,
      msg_type: requestType.replace(/_request$/, "_reply"),
    },
    parent_header: { session, msg_id: requestId, msg_type: requestType },
    content: { status: "ok" },
  };
}

function request(kernel, requestType, requestId, callback = () => {}, suppressStatus = true) {
  const message = kernel._createMessage(requestType, requestId);
  message.content = requestType === "execute_request" ? { code: "counter += 1" } : {};
  kernel._sendShellMessage(message, requestId, callback, suppressStatus);
}

describe("the local shell request coordinator", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
    spyOn(lumine.notifications, "addError").and.returnValue({ dismiss() {} });
  });

  afterEach(() => {
    kernel._stopAckWatchdog();
    kernel._clearRecovery();
  });

  it("puts only one ordinary shell request on the wire at a time", async () => {
    request(kernel, "complete_request", "complete_1");
    request(kernel, "execute_request", "execute_1", () => {}, false);

    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(kernel._activeShellRequest).toBe("complete_1");

    kernel.onIOMessage(status("complete_1", "busy", "complete_request"));
    kernel.onShellMessage(reply("complete_1", "complete_request"));
    kernel.onIOMessage(status("complete_1", "idle", "complete_request"));
    await settleMicrotasks();

    expect(kernel.shellSocket.sent.length).toBe(2);
    expect(kernel._activeShellRequest).toBe("execute_1");
  });

  it("supersedes queued autocomplete requests before they reach ZMQ", () => {
    request(kernel, "complete_request", "complete_1");
    const second = [];
    request(kernel, "complete_request", "complete_2", (message) => second.push(message));
    request(kernel, "complete_request", "complete_3");

    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(kernel.executionCallbacks.complete_2).toBeUndefined();
    expect(second[0].content.ename).toBe("ExecutionCancelled");
    expect(kernel._shellQueue).toEqual(["complete_3"]);
  });

  it("bounds an alternating autocomplete and inspection flood", async () => {
    request(kernel, "complete_request", "complete_active");
    for (let index = 0; index < 20; index++) {
      request(kernel, "complete_request", `complete_${index}`);
      request(kernel, "inspect_request", `inspect_${index}`);
    }

    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(Object.keys(kernel.executionCallbacks).sort()).toEqual(
      ["complete_active", "complete_19", "inspect_19"].sort(),
    );
    expect(kernel._shellQueue).toEqual(["complete_19", "inspect_19"]);

    for (const [requestId, requestType] of [
      ["complete_active", "complete_request"],
      ["complete_19", "complete_request"],
      ["inspect_19", "inspect_request"],
    ]) {
      kernel.onIOMessage(status(requestId, "busy", requestType));
      kernel.onShellMessage(reply(requestId, requestType));
      kernel.onIOMessage(status(requestId, "idle", requestType));
      await settleMicrotasks();
    }
    expect(kernel.executionCallbacks).toEqual({});
    expect(kernel._shellQueue).toEqual([]);
  });

  it("recovers a stranded request through a fresh connection without replaying code", async () => {
    const received = [];
    request(
      kernel,
      "execute_request",
      "execute_1",
      (message, channel) => received.push([message.header.msg_type, channel]),
      false,
    );
    kernel._startAckWatchdog();

    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    expect(kernel.lifecycle).toBe("recovering");
    expect(kernel.recoverySockets.length).toBe(1);
    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(kernel.recoverySockets[0].sent[0].content.code).toBeUndefined();

    kernel.onIOMessage(status("execute_1", "busy"));
    kernel.onShellMessage(reply("execute_1"));
    kernel.onIOMessage(status("execute_1", "idle"));
    const probe = kernel._recovery.probes[0];
    probe.socket.emit("message", reply(probe.id, "kernel_info_request", probe.session));
    kernel.onIOMessage(status(probe.id, "idle", "kernel_info_request", probe.session));
    await settleMicrotasks();

    expect(kernel.lifecycle).toBe("ready");
    expect(kernel._recovery).toBe(null);
    expect(received).toContain(["execute_reply", "shell"]);
    expect(received.some(([type]) => type === "error")).toBe(false);
    expect(kernel.shellSocket.sent.length).toBe(1);
  });

  it("returns a recovered suppressed completion to idle after the probe barrier", async () => {
    request(kernel, "complete_request", "complete_1", () => {}, true);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    kernel.onIOMessage(status("complete_1", "busy", "complete_request"));
    kernel.onShellMessage(reply("complete_1", "complete_request"));
    kernel.onIOMessage(status("complete_1", "idle", "complete_request"));
    const probe = kernel._recovery.probes[0];
    kernel.onIOMessage(status(probe.id, "busy", "kernel_info_request", probe.session));
    probe.socket.emit("message", reply(probe.id, "kernel_info_request", probe.session));
    kernel.onIOMessage(status(probe.id, "idle", "kernel_info_request", probe.session));
    await settleMicrotasks();

    expect(kernel.lifecycle).toBe("ready");
    expect(kernel.executionState).toBe("idle");
  });

  it("does not treat the probe reply alone as recovery", () => {
    request(kernel, "execute_request", "execute_1", () => {}, false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    const probe = kernel._recovery.probes[0];
    const statesBeforeProbe = kernel.states.slice();
    probe.socket.emit("message", reply(probe.id, "kernel_info_request", probe.session));
    kernel.onIOMessage(status(probe.id, "idle", "kernel_info_request", probe.session));

    expect(kernel.lifecycle).toBe("recovering");
    expect(kernel._recovery.targetProgress).toBe(false);
    expect(kernel.states).toEqual(statesBeforeProbe);
  });

  it("quarantines a missing probe without relabelling the completed target", async () => {
    const received = [];
    request(kernel, "execute_request", "execute_1", (message) => received.push(message), false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    kernel.onIOMessage(status("execute_1", "busy"));
    kernel.onShellMessage(reply("execute_1"));
    kernel.onIOMessage(status("execute_1", "idle"));
    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);
    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);
    await settleMicrotasks();

    expect(kernel.lifecycle).toBe("unresponsive");
    expect(received.some((message) => message.content?.ename)).toBe(false);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("keeps a known target outcome when the probe reply arrives without its idle", async () => {
    const received = [];
    request(kernel, "execute_request", "execute_1", (message) => received.push(message), false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    kernel.onIOMessage(status("execute_1", "busy"));
    kernel.onShellMessage(reply("execute_1"));
    kernel.onIOMessage(status("execute_1", "idle"));
    const probe = kernel._recovery.probes[0];
    probe.socket.emit("message", reply(probe.id, "kernel_info_request", probe.session));
    await settleMicrotasks();
    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);
    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);

    expect(kernel.lifecycle).toBe("unresponsive");
    expect(received.some((message) => message.content?.ename)).toBe(false);
  });

  it("runs at most two probes and rejects new work while recovery is active", () => {
    request(kernel, "execute_request", "execute_1", () => {}, false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    const rejected = [];
    request(kernel, "execute_request", "execute_2", (message) => rejected.push(message), false);
    expect(rejected.find((message) => message.content?.ename)?.content.ename).toBe(
      "KernelUnresponsive",
    );
    expect(kernel.shellSocket.sent.length).toBe(1);

    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);
    window.advanceClock(ZMQKernel.RECOVERY_RETRY_MS);
    expect(kernel.recoverySockets.length).toBe(2);
  });

  it("bounds a recovery probe that reports busy but never replies", () => {
    request(kernel, "execute_request", "execute_1", () => {}, false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);
    const probe = kernel._recovery.probes[0];
    kernel.onIOMessage(status(probe.id, "busy", "kernel_info_request", probe.session));

    window.advanceClock(ZMQKernel.RECOVERY_TIMEOUT_MS);

    expect(kernel.lifecycle).toBe("unresponsive");
  });

  it("cannot be wedged in recovering by a throwing cancellation callback", () => {
    spyOn(console, "error");
    request(kernel, "execute_request", "execute_1", () => {}, false);
    request(kernel, "complete_request", "complete_1", () => {
      throw new Error("plugin blew up");
    });
    kernel._startAckWatchdog();

    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);

    expect(kernel.lifecycle).toBe("recovering");
    expect(kernel._recovery).not.toBe(null);
    expect(kernel.recoverySockets.length).toBe(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("quarantines an unresolved execution and refuses every later send", () => {
    const received = [];
    request(
      kernel,
      "execute_request",
      "execute_1",
      (message, channel) => received.push([message, channel]),
      false,
    );
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);
    window.advanceClock(ZMQKernel.RECOVERY_TIMEOUT_MS);

    expect(kernel.lifecycle).toBe("unresponsive");
    expect(kernel.executionState).toBe("unresponsive");
    expect(received.find(([message]) => message.content?.ename)?.[0].content.ename).toBe(
      "ExecutionOutcomeUnknown",
    );
    expect(kernel.shellSocket.sent.length).toBe(1);

    const rejected = [];
    request(kernel, "execute_request", "execute_2", (message) => rejected.push(message), false);
    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(rejected.find((message) => message.content?.ename)?.content.ename).toBe(
      "KernelUnresponsive",
    );
    expect(lumine.notifications.addError.calls.count()).toBe(1);

    const stateCount = kernel.states.length;
    kernel.onIOMessage(status("execute_1", "busy"));
    expect(kernel.states.length).toBe(stateCount);
  });

  it("restarts into a fresh connection generation and discards every old socket", async () => {
    const oldSession = kernel.sessionId;
    const oldProcess = { pid: 123, exitCode: null, signalCode: null };
    const oldSockets = [kernel.shellSocket, fakeSocket(), fakeSocket()];
    kernel.ioSocket = oldSockets[1];
    kernel.stdinSocket = oldSockets[2];
    kernel.kernelProcess = oldProcess;
    kernel.connectionFile = "C:\\missing-old-kernel.json";
    kernel.options = { cwd: "C:\\workspace", cleanupConnectionFile: false };
    const killed = [];
    kernel._killProcessTree = async (child) => killed.push(child);
    const freshProcess = { pid: 456, stdout: { on() {} }, stderr: { on() {} }, on() {} };
    kernel._launchFreshGeneration = async () => ({
      config: {
        signature_scheme: "hmac-sha256",
        key: "fresh",
        transport: "tcp",
        ip: "127.0.0.1",
        shell_port: 22345,
      },
      connectionFile: "C:\\fresh-kernel.json",
      spawn: freshProcess,
    });
    kernel.monitorNotifications = () => {};
    let connected = 0;
    kernel.connect = (done) => {
      connected++;
      kernel.setLifecycle("ready");
      kernel.setExecutionState("idle");
      done();
    };
    let startup = 0;
    kernel._executeStartupCode = () => startup++;

    await kernel._replaceConnectionGeneration();

    expect(killed).toEqual([oldProcess]);
    expect(oldSockets.every((socket) => socket.closed)).toBe(true);
    expect(kernel._connectionGeneration).toBe(2);
    expect(kernel.sessionId).not.toBe(oldSession);
    expect(kernel.connection.shell_port).toBe(22345);
    expect(kernel.connectionFile).toBe("C:\\fresh-kernel.json");
    expect(kernel.kernelProcess).toBe(freshProcess);
    expect(connected).toBe(1);
    expect(startup).toBe(1);
  });

  it("waits for socket close, then process-tree death, before launching", async () => {
    const closed = deferred();
    const killed = deferred();
    const events = [];
    kernel.options = {};
    kernel.kernelProcess = { pid: 123, exitCode: null, signalCode: null };
    kernel.connectionFile = null;
    kernel._clearState = () => Promise.resolve();
    kernel._releaseSockets = () => {
      events.push("close");
      return closed.promise;
    };
    kernel._killProcessTree = () => {
      events.push("kill");
      return killed.promise;
    };
    kernel._launchFreshGeneration = async () => {
      events.push("launch");
      return {
        config: kernel.connection,
        connectionFile: "fresh.json",
        spawn: { stdout: { on() {} }, stderr: { on() {} }, on() {} },
      };
    };
    kernel.monitorNotifications = () => {};
    kernel.connect = (done) => done();
    kernel._executeStartupCode = () => {};

    const restarting = kernel._replaceConnectionGeneration();
    expect(events).toEqual(["close"]);

    closed.resolve();
    await settleMicrotasks();
    expect(events).toEqual(["close", "kill"]);

    killed.resolve();
    await settleMicrotasks();
    expect(events).toEqual(["close", "kill", "launch"]);
    expect(await restarting).toBe(true);
  });

  it("does not respawn when destruction wins during teardown", async () => {
    const closed = deferred();
    const events = [];
    kernel.options = {};
    kernel.kernelProcess = { pid: 123, exitCode: null, signalCode: null };
    kernel.connectionFile = null;
    kernel._clearState = () => Promise.resolve();
    kernel._releaseSockets = () => closed.promise;
    kernel._killProcessTree = async () => events.push("kill");
    kernel._launchFreshGeneration = async () => {
      events.push("launch");
      throw new Error("must not launch");
    };

    const restarting = kernel._replaceConnectionGeneration();
    kernel._destroyed = true;
    closed.resolve();

    expect(await restarting).toBe(false);
    expect(events).toEqual(["kill"]);
  });

  it("does not launch a new generation when the old process tree survives", async () => {
    const oldProcess = { pid: 123, exitCode: null, signalCode: null };
    kernel.options = {};
    kernel.kernelProcess = oldProcess;
    kernel.connectionFile = null;
    kernel._clearState = () => Promise.resolve();
    kernel._releaseSockets = async () => {};
    kernel._killProcessTree = async () => {
      throw new Error("tree still alive");
    };
    kernel._launchFreshGeneration = jasmine.createSpy("launchFreshGeneration");

    const restarted = await kernel._socketRestart();

    expect(restarted).toBe(false);
    expect(kernel._launchFreshGeneration).not.toHaveBeenCalled();
    expect(kernel.kernelProcess).toBe(oldProcess);
    expect(kernel.lifecycle).toBe("unresponsive");
  });

  it("settles a failed readiness wait and permits a later restart", async () => {
    kernel.options = {};
    kernel.kernelProcess = { pid: 123, exitCode: null, signalCode: null };
    kernel.connectionFile = null;
    kernel._clearState = () => Promise.resolve();
    kernel._releaseSockets = async () => {};
    kernel._killProcessTree = async () => {};
    kernel._launchFreshGeneration = async () => ({
      config: kernel.connection,
      connectionFile: "fresh.json",
      spawn: { stdout: { on() {} }, stderr: { on() {} }, on() {} },
    });
    kernel.monitorNotifications = () => {};
    kernel.connect = () => {};

    const first = kernel._socketRestart();
    for (let turn = 0; turn < 8 && !kernel._restartReadyReject; turn++) {
      await Promise.resolve();
    }
    kernel._rejectRestartReady(new Error("new process died"));

    expect(await first).toBe(false);
    await Promise.resolve();
    expect(kernel._restartPromise).toBe(null);

    kernel.connect = (done) => done();
    kernel._executeStartupCode = () => {};
    expect(await kernel._socketRestart()).toBe(true);
  });

  it("classifies sent and queued executions correctly during a manual restart", () => {
    const active = [];
    const queued = [];
    request(kernel, "execute_request", "execute_1", (message) => active.push(message), false);
    request(kernel, "execute_request", "execute_2", (message) => queued.push(message), false);

    kernel._clearState("Kernel restarted", false, true);

    expect(active.find((message) => message.content?.ename)?.content.ename).toBe(
      "ExecutionOutcomeUnknown",
    );
    expect(queued.find((message) => message.content?.ename)?.content.ename).toBe(
      "ExecutionCancelled",
    );
  });

  it("quiesces the transport before restart settlements can reenter execution", () => {
    const reentrant = [];
    request(kernel, "execute_request", "execute_1", () => {}, false);
    request(kernel, "complete_request", "complete_1", (message) => {
      if (message.content?.ename) {
        request(
          kernel,
          "execute_request",
          "execute_late",
          (result) => reentrant.push(result),
          false,
        );
      }
    });

    kernel.invalidatePendingRequests("Kernel restarted");

    expect(kernel.lifecycle).toBe("restarting");
    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(reentrant.find((message) => message.content?.ename)?.content.ename).toBe(
      "ExecutionCancelled",
    );
    expect(kernel.executionCallbacks.execute_late).toBeUndefined();
  });

  it("preserves precise restart outcomes through the public kernel facade", async () => {
    kernel.supportsComms = false;
    kernel.grammar = { name: "IPython" };
    kernel.restart = async () => true;
    const facade = new Kernel(kernel);
    const active = [];
    const queued = [];
    facade.execute("first()", (result) => active.push(result));
    facade.execute("second()", (result) => queued.push(result));

    await facade.restart();

    expect(active.find((result) => result.ename)?.ename).toBe("ExecutionOutcomeUnknown");
    expect(queued.find((result) => result.ename)?.ename).toBe("ExecutionCancelled");
    expect(facade._inFlight.size).toBe(0);
  });

  it("returns an unknown execution outcome through the public promise API", async () => {
    kernel.supportsComms = false;
    kernel.grammar = { name: "IPython" };
    kernel.restart = async () => true;
    const facade = new Kernel(kernel);
    const api = new JupyterKernel(facade);
    const execution = api.execute("side_effect()");

    await facade.restart();
    const result = await execution;

    expect(result.status).toBe("error");
    expect(result.error.ename).toBe("ExecutionOutcomeUnknown");
  });

  it("releases the watch hold when restart invalidates its execution", async () => {
    kernel.supportsComms = false;
    kernel.grammar = { name: "IPython" };
    kernel.restart = async () => true;
    const facade = new Kernel(kernel);
    facade.executeWatch("value", () => {});
    expect(facade._watchExecutionDepth).toBe(1);

    await facade.restart();

    expect(facade._watchExecutionDepth).toBe(0);
    expect(facade._inFlight.size).toBe(0);
  });

  it("blocks execution reentered from public destroy settlements", () => {
    kernel.supportsComms = false;
    kernel.grammar = { name: "IPython" };
    kernel.destroy = () => {};
    const facade = new Kernel(kernel);
    const late = [];
    facade.execute("first()", (result) => {
      if (result.ename) facade.execute("late()", (next) => late.push(next));
    });

    facade.destroy();

    expect(kernel.lifecycle).toBe("shutting-down");
    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(late.find((result) => result.ename)?.ename).toBe("ExecutionCancelled");
  });

  it("cancels recovery timers and probes when destroyed", () => {
    request(kernel, "execute_request", "execute_1", () => {}, false);
    kernel._startAckWatchdog();
    window.advanceClock(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);
    const probeSocket = kernel._recovery.probes[0].socket;
    kernel._kill = async () => {};

    kernel.destroy();
    window.advanceClock(ZMQKernel.RECOVERY_TIMEOUT_MS);

    expect(kernel._destroyed).toBe(true);
    expect(kernel._recovery).toBe(null);
    expect(probeSocket.closed).toBe(true);
    expect(kernel.recoverySockets.length).toBe(1);
  });

  it("discards an initial process whose async launch finishes after destroy", async () => {
    const launched = deferred();
    const killed = [];
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.returnValue(launched.promise);
    spyOn(ZMQKernel.prototype, "_killProcessTree").and.callFake(async (child) => {
      if (child) killed.push(child);
    });
    const instance = new ZMQKernel(
      { display_name: "Python 3", language: "python" },
      { name: "IPython" },
      {},
      () => {},
    );
    const lateProcess = {};

    instance.destroy();
    launched.resolve({
      config: kernel.connection,
      connectionFile: "C:\\late-kernel.json",
      spawn: lateProcess,
    });
    await settleMicrotasks();

    expect(killed).toEqual([lateProcess]);
    expect(instance.kernelProcess).toBe(null);
    expect(instance.shellSocket).toBeUndefined();
  });
});
