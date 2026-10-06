const { EventEmitter } = require("node:events");
const { Disposable, Emitter } = require("lumine");

function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

describe("local recovery controller boundaries", () => {
  let ZMQKernel, kernel, controller, kernels, sockets, probeGates, intervals, callbacks, now;

  function socket(gate = null) {
    const resource = deferred();
    let closing;
    const result = new EventEmitter();
    result.sent = [];
    result.closedResources = resource.promise;
    result.connect = () => {};
    result.send = async (message, stale = null) => {
      if (!stale?.()) result.sent.push(message);
    };
    result.close = jasmine.createSpy("close probe").and.callFake((unload) => {
      if (unload) {
        gate?.resolve();
        resource.resolve();
        return Promise.resolve();
      }
      closing ||= (gate?.promise || Promise.resolve()).then(() => resource.resolve());
      return closing;
    });
    sockets.push(result);
    return result;
  }

  function transport() {
    const result = Object.create(ZMQKernel.prototype);
    result._destroyed = false;
    result._emitter = new Emitter();
    result.lifecycle = "ready";
    result.executionState = "idle";
    result.kernelSpec = { display_name: "Recovery test", language: "python" };
    result.displayName = "Recovery test";
    result.sessionId = "controller-session";
    result._connectionGeneration = 1;
    result.connection = {
      signature_scheme: "hmac-sha256",
      key: "secret",
      transport: "tcp",
      ip: "127.0.0.1",
      shell_port: 12345,
    };
    result.executionCallbacks = {};
    result._shellQueue = [];
    result._activeShellRequest = null;
    result._readyProbeIds = new Set();
    result._reportedExecutionState = "idle";
    result._reportedIdleSince = now;
    result._reportedStatusParent = null;
    result.shellSocket = socket();
    result.probeSockets = [];
    result._createRecoverySocket = () => {
      const probe = socket(probeGates.shift());
      result.probeSockets.push(probe);
      return probe;
    };
    result.states = [];
    result.setExecutionState = (state) => {
      result.executionState = state;
      result.states.push(state);
    };
    result.setExecutionCount = () => {};
    result.setExecutionStartTime = () => {};
    result.setLastExecutionTime = () => {};
    kernels.push(result);
    return result;
  }

  beforeEach(() => {
    ZMQKernel = require("../lib/zmq-kernel");
    kernels = [];
    sockets = [];
    probeGates = [];
    intervals = new Map();
    callbacks = [];
    now = 1000000;
    spyOn(Date, "now").and.callFake(() => now);
    spyOn(globalThis, "setInterval").and.callFake((callback, delay) => {
      const handle = callbacks.length + 1;
      callbacks.push({ handle, callback, delay, nextTick: now + delay });
      intervals.set(handle, callback);
      return handle;
    });
    spyOn(globalThis, "clearInterval").and.callFake((handle) => intervals.delete(handle));
    spyOn(lumine.window, "onWillDestroy").and.returnValue(new Disposable());
    spyOn(lumine.notifications, "addError").and.returnValue({ dismiss() {} });
    kernel = transport();
    controller = kernel._recoveryOwner();
  });

  afterEach(async () => {
    for (const item of kernels) {
      item._destroyed = true;
      item._stopAckWatchdog();
      item._recoveryOwner().dismissNotification();
    }
    await Promise.all(sockets.map((item) => item.close(true, true)));
    await Promise.all(kernels.map((item) => item._clearRecovery(true)));
    for (const item of kernels) {
      item._connectionOwner()._unloadSubscription?.dispose();
      item._emitter?.dispose();
    }
  });

  function advance(milliseconds) {
    const end = now + milliseconds;
    while (true) {
      const due = callbacks
        .filter((timer) => intervals.has(timer.handle) && timer.nextTick <= end)
        .sort((left, right) => left.nextTick - right.nextTick);
      if (!due.length) break;
      now = due[0].nextTick;
      for (const timer of due.filter((candidate) => candidate.nextTick === now)) {
        timer.nextTick += timer.delay;
        if (intervals.get(timer.handle) === timer.callback) timer.callback();
      }
    }
    now = end;
  }

  function reply(id, type = "execute_request", session = kernel.sessionId) {
    return {
      header: { msg_id: `${id}_reply`, msg_type: type.replace(/_request$/, "_reply") },
      parent_header: { msg_id: id, msg_type: type, session },
      content: { status: "ok" },
    };
  }

  function status(id, state, type = "execute_request", session = kernel.sessionId) {
    return {
      header: { msg_id: `${id}_${state}`, msg_type: "status" },
      parent_header: { msg_id: id, msg_type: type, session },
      content: { execution_state: state },
    };
  }

  function request(id = "target", received = [], host = kernel) {
    const message = host._createMessage("execute_request", id);
    message.content = { code: "counter += 1" };
    host._sendShellMessage(message, id, (output) => received.push(output), false);
    return received;
  }

  function recover(id = "target") {
    request(id);
    kernel._beginRecovery(id);
    return kernel._recovery;
  }

  function finishTarget(id = "target") {
    kernel.onIOMessage(status(id, "busy"));
    kernel.onShellMessage(reply(id));
    kernel.onIOMessage(status(id, "idle"));
  }

  function probeReply(probe) {
    return reply(probe.id, "kernel_info_request", probe.session);
  }

  function probeIdle(probe) {
    return status(probe.id, "idle", "kernel_info_request", probe.session);
  }

  async function settle() {
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
  }

  it("requires target completion and every probe's reply, idle and physical close", async () => {
    const firstClose = deferred();
    const secondClose = deferred();
    probeGates.push(firstClose, secondClose);
    const recovery = recover();
    kernel._runRecoveryProbe();
    const [first, second] = recovery.probes;
    first.socket.emit("message", probeReply(first));
    kernel.onIOMessage(probeIdle(first));
    firstClose.resolve();
    await first.closedPromise;
    expect(kernel.lifecycle).toBe("recovering");
    expect(recovery.targetProgress).toBe(false);
    second.socket.emit("message", probeReply(second));
    finishTarget();
    expect(kernel.executionCallbacks.target).toBeUndefined();
    expect(kernel.lifecycle).toBe("recovering");
    kernel.onIOMessage(probeIdle(second));
    expect(kernel.lifecycle).toBe("recovering");
    secondClose.resolve();
    await second.closedPromise;
    await settle();

    expect(kernel.lifecycle).toBe("ready");
    expect(kernel._recovery).toBeNull();
    expect(kernel.shellSocket.sent.length).toBe(1);
    expect(
      kernel.probeSockets.every((item) => item.sent[0].header.msg_type === "kernel_info_request"),
    ).toBe(true);
    expect(kernel.probeSockets.every((item) => item.sent[0].content.code === undefined)).toBe(true);
  });

  const malformedReplies = [
    ["another reply type", (message) => ({ ...message, header: { msg_type: "execute_reply" } })],
    ["a missing header", (message) => ({ ...message, header: undefined })],
    [
      "a missing reply message ID",
      (message) => ({ ...message, header: { ...message.header, msg_id: undefined } }),
    ],
    [
      "a missing parent request type",
      (message) => ({
        ...message,
        parent_header: { ...message.parent_header, msg_type: undefined },
      }),
    ],
    ["missing content", (message) => ({ ...message, content: undefined })],
    ["non-object content", (message) => ({ ...message, content: "not a reply body" })],
  ];
  for (const [label, malformed] of malformedReplies) {
    it(`does not treat ${label} with matching parent identity as a probe reply`, async () => {
      const recovery = recover();
      const probe = recovery.probes[0];
      finishTarget();
      kernel.onIOMessage(probeIdle(probe));
      probe.socket.emit("message", malformed(probeReply(probe)));

      expect(probe.replySeen).toBe(false);
      expect(probe.socket.close).not.toHaveBeenCalled();
      expect(kernel.lifecycle).toBe("recovering");

      probe.socket.emit("message", probeReply(probe));
      await probe.closedPromise;
      await settle();
      expect(kernel.lifecycle).toBe("ready");
    });
  }

  it("accepts a valid probe reply once while its close is still pending", async () => {
    const close = deferred();
    probeGates.push(close);
    const probe = recover().probes[0];
    probe.socket.emit("message", probeReply(probe));
    const closing = probe.closedPromise;
    probe.socket.emit("message", probeReply(probe));

    expect(probe.socket.close).toHaveBeenCalledTimes(1);
    expect(probe.closedPromise).toBe(closing);
    close.resolve();
    await closing;
  });

  for (const transition of ["shutting-down", "dead", "new-generation", "destroyed"]) {
    it(`does not restore ready or drain after cleanup is overtaken by ${transition}`, async () => {
      const closing = deferred();
      const recovery = { targetId: "old", targetProgress: true, probes: [] };
      kernel._recovery = recovery;
      kernel.setLifecycle("recovering");
      kernel.setExecutionState("recovering");
      spyOn(controller, "clear").and.callFake(() => {
        kernel._recovery = null;
        return closing.promise;
      });
      const drain = spyOn(kernel, "_drainShellQueue");
      const completing = controller.complete(recovery);
      if (transition === "new-generation") {
        kernel._connectionGeneration++;
        kernel.setLifecycle("ready");
        kernel.setExecutionState("idle");
      } else if (transition === "destroyed") {
        kernel._destroyed = true;
        kernel.setLifecycle("dead");
      } else {
        kernel.setLifecycle(transition);
        kernel.setExecutionState(transition);
        if (transition === "shutting-down") kernel._shutdownPromise = Promise.resolve();
      }
      const lifecycle = kernel.lifecycle;
      const state = kernel.executionState;
      closing.resolve();
      await completing;

      expect(kernel.lifecycle).toBe(lifecycle);
      expect(kernel.executionState).toBe(state);
      expect(drain).not.toHaveBeenCalled();
    });
  }

  it("restores the current successful recovery only after its cleanup finishes", async () => {
    const closing = deferred();
    const recovery = { targetId: "old", targetProgress: true, probes: [] };
    kernel._recovery = recovery;
    kernel.setLifecycle("recovering");
    kernel.setExecutionState("recovering");
    spyOn(controller, "clear").and.callFake(() => {
      kernel._recovery = null;
      return closing.promise;
    });
    const drain = spyOn(kernel, "_drainShellQueue");
    const completing = controller.complete(recovery);
    expect(kernel.lifecycle).toBe("recovering");
    expect(drain).not.toHaveBeenCalled();
    closing.resolve();
    await completing;

    expect(kernel.lifecycle).toBe("ready");
    expect(kernel.executionState).toBe("idle");
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("cannot let an old probe close rewrite busy state or clear a replacement quarantine", async () => {
    const close = deferred();
    probeGates.push(close);
    const probe = recover().probes[0];
    probe.socket.emit("message", probeReply(probe));
    const cleared = kernel._clearRecovery();
    kernel._connectionGeneration++;
    const replacement = { targetId: "new", probes: [], quarantined: true };
    kernel._recovery = replacement;
    kernel.setLifecycle("unresponsive");
    kernel._reportedExecutionState = "busy";
    kernel._reportedStatusParent = probe.id;
    close.resolve();
    await probe.closedPromise;
    await cleared;

    expect(kernel._recovery).toBe(replacement);
    expect(kernel._reportedExecutionState).toBe("busy");
    expect(kernel._reportedStatusParent).toBe(probe.id);
    expect(kernel.lifecycle).toBe("unresponsive");
  });

  it("owns each watchdog independently and ignores its stopped callback", () => {
    request("first");
    const second = transport();
    request("second", [], second);
    kernel._startAckWatchdog();
    const firstTimer = kernel._ackWatchdog;
    const oldTick = intervals.get(firstTimer);
    second._startAckWatchdog();
    const secondTimer = second._ackWatchdog;
    kernel._stopAckWatchdog();
    expect(intervals.has(firstTimer)).toBe(false);
    expect(intervals.has(secondTimer)).toBe(true);
    now += ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS;
    oldTick();
    expect(kernel.probeSockets.length).toBe(0);
    intervals.get(secondTimer)();

    expect(second.lifecycle).toBe("recovering");
    expect(second.probeSockets.length).toBe(1);
    expect(kernel.lifecycle).toBe("ready");
  });

  it("ignores a queued watchdog from before a connection generation change", () => {
    request();
    kernel._startAckWatchdog();
    const oldTick = intervals.get(kernel._ackWatchdog);
    kernel._connectionGeneration++;
    kernel.executionCallbacks = {};
    kernel._shellQueue = [];
    kernel._activeShellRequest = null;
    request("current-target");
    kernel._startAckWatchdog();
    const currentTick = intervals.get(kernel._ackWatchdog);
    now += ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS;
    oldTick();
    expect(kernel.probeSockets.length).toBe(0);
    currentTick();

    expect(kernel.probeSockets.length).toBe(1);
  });

  for (const known of [false, true]) {
    it(`preserves a ${known ? "known" : "unknown"} target outcome through quarantine without replay`, async () => {
      const received = request();
      kernel._startAckWatchdog();
      advance(ZMQKernel.ACK_PROBE_AFTER_MS + ZMQKernel.ACK_POLL_INTERVAL_MS);
      if (known) finishTarget();
      advance(known ? ZMQKernel.RECOVERY_RETRY_MS * 2 : ZMQKernel.RECOVERY_TIMEOUT_MS);
      await settle();

      expect(kernel.lifecycle).toBe("unresponsive");
      const errors = received.filter((message) => message.header?.msg_type === "error");
      if (known) expect(errors).toEqual([]);
      else
        expect(errors.map((message) => message.content.ename)).toEqual(["ExecutionOutcomeUnknown"]);
      const later = request("later");
      advance(ZMQKernel.RECOVERY_TIMEOUT_MS * 2);
      kernel.onIOMessage(status("target", "idle"));
      kernel.onShellMessage(reply("target"));
      expect(kernel.lifecycle).toBe("unresponsive");
      expect(kernel.shellSocket.sent.length).toBe(1);
      expect(later.find((message) => message.content?.ename)?.content.ename).toBe(
        "KernelUnresponsive",
      );
      expect(lumine.notifications.addError).toHaveBeenCalledTimes(1);
    });
  }

  it("settles the uncertain target when shutdown already owns the lifecycle latch", async () => {
    const received = request("target");
    const queued = request("queued");
    const dataSocket = kernel.shellSocket;
    kernel._beginRecovery("target");
    const probeCount = kernel.probeSockets.length;

    const shutdown = kernel.shutdown();
    expect(kernel.shutdown()).toBe(shutdown);
    await shutdown;

    expect(
      received
        .filter((message) => message.header?.msg_type === "error")
        .map((message) => message.content.ename),
    ).toEqual(["ExecutionOutcomeUnknown"]);
    expect(
      queued
        .filter((message) => message.header?.msg_type === "error")
        .map((message) => message.content.ename),
    ).toEqual(["ExecutionCancelled"]);
    expect(received.filter((message) => message.header?.msg_type === "execute_reply").length).toBe(
      1,
    );
    expect(queued.filter((message) => message.header?.msg_type === "execute_reply").length).toBe(1);
    expect(kernel.executionCallbacks.target).toBeUndefined();
    expect(kernel.executionCallbacks.queued).toBeUndefined();
    expect(kernel.probeSockets.length).toBe(probeCount);
    expect(dataSocket.sent.length).toBe(1);
    expect(lumine.notifications.addError).not.toHaveBeenCalled();
  });

  it("waits through another client's busy silence and starts the idle deadline anew", () => {
    request();
    kernel._startAckWatchdog();
    kernel.onIOMessage(status("console", "busy", "execute_request", "foreign-client"));
    advance(ZMQKernel.RECOVERY_TIMEOUT_MS * 3);
    expect(kernel.lifecycle).toBe("ready");
    expect(kernel.probeSockets.length).toBe(0);
    kernel.onIOMessage(status("console", "idle", "execute_request", "foreign-client"));
    advance(ZMQKernel.ACK_PROBE_AFTER_MS - 1);
    expect(kernel.probeSockets.length).toBe(0);
    advance(ZMQKernel.ACK_POLL_INTERVAL_MS + 1);

    expect(kernel.lifecycle).toBe("recovering");
    expect(kernel.probeSockets.length).toBe(1);
    expect(kernel.shellSocket.sent.length).toBe(1);
  });

  it("never treats an acknowledged long-running execution as an unacknowledged send", () => {
    const received = request();
    kernel._startAckWatchdog();
    kernel.onIOMessage(status("target", "busy"));
    advance(ZMQKernel.RECOVERY_TIMEOUT_MS * 10);

    expect(kernel.lifecycle).toBe("ready");
    expect(kernel.executionState).toBe("busy");
    expect(kernel.probeSockets.length).toBe(0);
    expect(received.some((message) => message.content?.ename)).toBe(false);
    expect(kernel.shellSocket.sent.length).toBe(1);
  });

  it("pauses recovery retry and quarantine deadlines while another client owns busy state", () => {
    const recovery = recover();
    kernel._startAckWatchdog();
    kernel.onIOMessage(status("console", "busy", "execute_request", "foreign-client"));
    advance(ZMQKernel.RECOVERY_TIMEOUT_MS * 3);
    expect(kernel._recovery).toBe(recovery);
    expect(kernel.lifecycle).toBe("recovering");
    expect(kernel.probeSockets.length).toBe(1);
    kernel.onIOMessage(status("console", "idle", "execute_request", "foreign-client"));
    advance(ZMQKernel.ACK_POLL_INTERVAL_MS);
    advance(ZMQKernel.RECOVERY_RETRY_MS);

    expect(kernel.probeSockets.length).toBe(2);
    expect(kernel.lifecycle).toBe("recovering");
  });

  for (const action of ["destroy", "shutdown"]) {
    it(`does not create a probe or revive state when a lifecycle subscriber triggers ${action}`, async () => {
      request();
      const subscription = kernel.onDidChangeLifecycle((state) => {
        if (state !== "recovering") return;
        if (action === "destroy") kernel.destroy();
        else {
          kernel._shutdownPromise = Promise.resolve();
          kernel.setLifecycle("shutting-down");
          kernel.setExecutionState("shutting-down");
          kernel._clearRecovery();
        }
      });
      kernel._beginRecovery("target");
      await settle();
      subscription.dispose();

      expect(kernel.probeSockets.length).toBe(0);
      expect(kernel._recovery).toBeNull();
      expect(kernel.lifecycle).toBe(action === "destroy" ? "dead" : "shutting-down");
      expect(kernel.executionState).not.toBe("recovering");
    });
  }
});
