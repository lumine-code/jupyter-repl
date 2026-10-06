const fs = require("node:fs");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { Disposable, Emitter } = require("lumine");

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("local connection generation resource ownership", () => {
  let ZMQKernel,
    kernel,
    owner,
    children,
    sockets,
    events,
    removedFiles,
    unloadCallbacks,
    unloadHooks;

  function child(pid) {
    const process = new EventEmitter();
    process.pid = pid;
    process.exitCode = null;
    process.signalCode = null;
    process.stdout = new PassThrough();
    process.stderr = new PassThrough();
    children.push(process);
    return process;
  }

  function socket(name, nativeClose = null) {
    const resourceClose = deferred();
    const result = new EventEmitter();
    sockets.push(result);
    result.closedResources = resourceClose.promise;
    result.closed = false;
    result.close = jasmine.createSpy(`${name} close`).and.callFake((forUnload) => {
      events.push(`${name}:${forUnload ? "force-close" : "close"}`);
      if (forUnload || !nativeClose) {
        result.closed = true;
        resourceClose.resolve();
        return Promise.resolve();
      }
      return nativeClose.promise.then(() => {
        result.closed = true;
      });
    });
    result.send = jasmine.createSpy(`${name} send`).and.resolveTo();
    return result;
  }

  function generation(process, file) {
    return {
      spawn: process,
      connectionFile: file,
      config: {
        signature_scheme: "hmac-sha256",
        key: "secret",
        transport: "tcp",
        ip: "127.0.0.1",
        shell_port: 12345,
        iopub_port: 12346,
        stdin_port: 12347,
      },
    };
  }

  beforeEach(() => {
    ZMQKernel = require("../lib/zmq-kernel");
    kernel = Object.create(ZMQKernel.prototype);
    children = [];
    sockets = [];
    events = [];
    removedFiles = [];
    unloadCallbacks = [];
    unloadHooks = new Set();
    spyOn(lumine.window, "onWillDestroy").and.callFake((callback) => {
      unloadCallbacks.push(callback);
      unloadHooks.add(callback);
      return new Disposable(() => unloadHooks.delete(callback));
    });
    kernel._destroyed = false;
    kernel._emitter = new Emitter();
    kernel.lifecycle = "ready";
    kernel.executionState = "idle";
    kernel.kernelSpec = { display_name: "Generation test", language: "python" };
    kernel.grammar = { name: "Python", scopeName: "source.python" };
    kernel.displayName = "Generation test";
    kernel.startingKernelKey = "generation-test";
    kernel.options = {};
    kernel._connectionGeneration = 1;
    kernel.sessionId = "original-session";
    kernel.connection = generation(null, null).config;
    kernel.connectionFile = null;
    kernel.kernelProcess = null;
    kernel._everReady = true;
    kernel._expectingExit = false;
    kernel.executionCallbacks = {};
    kernel._readyProbeIds = new Set();
    kernel._shellQueue = [];
    kernel._quarantinedRequestIds = new Set();
    kernel._clearState = jasmine.createSpy("clear protocol state").and.resolveTo();
    kernel._clearRecovery = jasmine.createSpy("clear recovery").and.resolveTo();
    kernel._clearStartingMarker = jasmine.createSpy("clear own startup marker");
    kernel._stopReadyProbe = jasmine.createSpy("stop readiness");
    kernel._stopAckWatchdog = jasmine.createSpy("stop watchdog");
    kernel._cancelReadiness = jasmine.createSpy("cancel readiness");
    kernel.emitDidLoseKernel = jasmine.createSpy("lose kernel");
    kernel._showUnresponsiveNotification = jasmine.createSpy("report surviving process");
    kernel._executeStartupCode = jasmine.createSpy("startup code");
    kernel.connect = jasmine.createSpy("connect new sockets").and.callFake((done) => {
      kernel.setLifecycle("ready");
      done();
    });
    kernel._killProcessTree = jasmine
      .createSpy("kill process tree")
      .and.callFake(async (process) => {
        events.push(`kill:${process?.pid ?? "none"}`);
        if (process) process.exitCode = 0;
      });
    spyOn(fs, "unlinkSync").and.callFake((file) => removedFiles.push(file));
    for (const method of ["addError", "addWarning", "addInfo"]) {
      spyOn(lumine.notifications, method).and.returnValue({ dismiss() {} });
    }
    const getConfig = lumine.config.get.bind(lumine.config);
    spyOn(lumine.config, "get").and.callFake((key) =>
      key === "jupyter-repl.kernelNotifications" ? true : getConfig(key),
    );
    owner = kernel._connectionOwner();
  });

  afterEach(async () => {
    kernel._destroyed = true;
    await Promise.all(sockets.map((item) => item.close(true, true)));
    owner._unloadSubscription?.dispose();
    owner.detachProcess?.(kernel.kernelProcess);
    for (const process of children) {
      owner.detachProcess?.(process);
      process.stdout.destroy();
      process.stderr.destroy();
    }
    kernel._emitter?.dispose();
  });

  it("detaches old socket references before waiting without retiring a replacement set", async () => {
    const nativeClose = deferred();
    const old = [socket("old-shell", nativeClose), socket("old-iopub"), socket("old-stdin")];
    [kernel.shellSocket, kernel.ioSocket, kernel.stdinSocket] = old;
    const closing = owner.releaseSockets(false, true);
    expect(kernel.shellSocket).toBeNull();
    expect(kernel.ioSocket).toBeNull();
    expect(kernel.stdinSocket).toBeNull();
    const fresh = [socket("fresh-shell"), socket("fresh-iopub"), socket("fresh-stdin")];
    [kernel.shellSocket, kernel.ioSocket, kernel.stdinSocket] = fresh;
    kernel._connectionGeneration++;
    nativeClose.resolve();
    await closing;

    expect(kernel.shellSocket).toBe(fresh[0]);
    expect(kernel.ioSocket).toBe(fresh[1]);
    expect(kernel.stdinSocket).toBe(fresh[2]);
    expect(fresh.every((item) => item.close.calls.count() === 0)).toBe(true);
    expect(old.every((item) => item.close.calls.count() === 1)).toBe(true);
  });

  for (const nativeClosed of [false, true]) {
    it(`forces a retired socket's resources closed before unload kills the peer (${nativeClosed ? "observer pending" : "send pending"})`, async () => {
      const nativeClose = deferred();
      const old = socket("retired", nativeClose);
      const process = child(100);
      kernel.shellSocket = old;
      kernel.kernelProcess = process;
      const closing = owner.releaseSockets(false, true);
      if (nativeClosed) {
        nativeClose.resolve();
        await closing;
      }
      expect(kernel.shellSocket).toBeNull();
      kernel._destroyed = true;
      await owner.destroy(true, Promise.resolve(), true);

      expect(old.close).toHaveBeenCalledWith(true, true);
      expect(events.indexOf("retired:force-close")).toBeLessThan(events.indexOf("kill:100"));
      expect(kernel._killProcessTree).toHaveBeenCalledWith(process);
      nativeClose.resolve();
      await closing;
    });
  }

  it("escalates an ordinary destroy to unload without losing the peer or killing twice", async () => {
    const nativeClose = deferred();
    const processDeath = deferred();
    const old = socket("retired", nativeClose);
    const process = child(100);
    kernel.shellSocket = old;
    kernel.kernelProcess = process;
    kernel._destroyed = true;
    kernel._killProcessTree.and.callFake((value) => {
      expect(value).toBe(process);
      events.push("kill:100");
      return processDeath.promise;
    });
    const ordinary = owner.destroy(false, Promise.resolve(), true);
    expect(kernel.kernelProcess).toBeNull();
    expect(kernel._killProcessTree).not.toHaveBeenCalled();
    const unloading = owner.destroy(true, Promise.resolve(), true);

    expect(old.close).toHaveBeenCalledWith(true, true);
    expect(events.indexOf("retired:force-close")).toBeLessThan(events.indexOf("kill:100"));
    expect(kernel._killProcessTree).toHaveBeenCalledTimes(1);
    processDeath.resolve();
    await unloading;
    nativeClose.resolve();
    await ordinary;
    expect(kernel._killProcessTree).toHaveBeenCalledTimes(1);
  });

  it("keeps unload cleanup reachable after the public facade leaves the store", async () => {
    const nativeClose = deferred();
    const processDeath = deferred();
    const old = socket("retired", nativeClose);
    const process = child(100);
    kernel.shellSocket = old;
    kernel.kernelProcess = process;
    kernel.supportsComms = false;
    kernel._killProcessTree.and.callFake((value) => {
      expect(value).toBe(process);
      events.push("kill:100");
      return processDeath.promise;
    });
    const Kernel = require("../lib/kernel");
    const facade = new Kernel(kernel);
    const store = require("../lib/store");
    const previous = store.runningKernels;
    store.runningKernels = [facade];
    const removed = spyOn(store, "deleteKernel").and.callFake((item) => {
      store.runningKernels = store.runningKernels.filter((candidate) => candidate !== item);
    });
    try {
      facade.destroy();
      const ordinary = owner.teardownPromise;
      const unload = unloadCallbacks.at(-1);
      expect(removed).toHaveBeenCalledWith(facade);
      expect(store.runningKernels).toEqual([]);
      expect(typeof unload).toBe("function");
      expect(unloadHooks.has(unload)).toBe(true);
      expect(kernel._killProcessTree).not.toHaveBeenCalled();

      unload();

      expect(old.close).toHaveBeenCalledWith(true, true);
      expect(events.indexOf("retired:force-close")).toBeLessThan(events.indexOf("kill:100"));
      expect(kernel._killProcessTree).toHaveBeenCalledTimes(1);
      processDeath.resolve();
      await owner.teardownPromise;
      nativeClose.resolve();
      await ordinary;
      expect(kernel._killProcessTree).toHaveBeenCalledTimes(1);
      expect(unloadHooks.has(unload)).toBe(false);
    } finally {
      store.runningKernels = previous;
    }
  });

  it("closes sockets before killing the old tree and launches only after its death", async () => {
    const nativeClose = deferred();
    const processDeath = deferred();
    const killing = deferred();
    const process = child(100);
    const replacement = child(200);
    kernel.shellSocket = socket("shell", nativeClose);
    kernel.kernelProcess = process;
    kernel.connectionFile = "old-owned.json";
    kernel._killProcessTree.and.callFake((value) => {
      expect(value).toBe(process);
      events.push("kill");
      killing.resolve();
      return processDeath.promise;
    });
    kernel._launchFreshGeneration = jasmine
      .createSpy("launch replacement")
      .and.callFake(async () => {
        events.push("launch");
        return generation(replacement, "new-owned.json");
      });
    const restarting = kernel.restart();
    await Promise.resolve();
    expect(kernel._killProcessTree).not.toHaveBeenCalled();
    expect(kernel._launchFreshGeneration).not.toHaveBeenCalled();
    nativeClose.resolve();
    await killing.promise;
    expect(kernel._launchFreshGeneration).not.toHaveBeenCalled();
    processDeath.resolve();
    expect(await restarting).toBe(true);

    expect(events).toEqual(["shell:close", "kill", "launch"]);
    expect(removedFiles).toEqual(["old-owned.json"]);
    expect(kernel.kernelProcess).toBe(replacement);
    expect(kernel.connectionFile).toBe("new-owned.json");
  });

  it("shares concurrent restarts and calls each successful restart callback once", async () => {
    const launched = deferred();
    const entered = deferred();
    const replacement = child(200);
    kernel._launchFreshGeneration = jasmine.createSpy("launch once").and.callFake(() => {
      entered.resolve();
      return launched.promise;
    });
    const firstDone = jasmine.createSpy("first restart ready");
    const secondDone = jasmine.createSpy("second restart ready");
    const first = kernel.restart(firstDone);
    const second = kernel.restart(secondDone);
    expect(second).toBe(first);
    await entered.promise;
    launched.resolve(generation(replacement, "fresh.json"));
    expect(await first).toBe(true);
    await second;

    expect(kernel._launchFreshGeneration).toHaveBeenCalledTimes(1);
    expect(kernel.connect).toHaveBeenCalledTimes(1);
    expect(kernel._executeStartupCode).toHaveBeenCalledTimes(1);
    expect(firstDone).toHaveBeenCalledTimes(1);
    expect(secondDone).toHaveBeenCalledTimes(1);
    expect(kernel._restartPromise).toBeNull();
  });

  it("restores the old process's exact handlers when its tree cannot be retired", async () => {
    const process = child(100);
    kernel.kernelProcess = process;
    kernel.connectionFile = "surviving-old.json";
    kernel.shellSocket = socket("old-shell");
    kernel.monitorNotifications(process);
    const original = {
      error: process.listeners("error").slice(),
      exit: process.listeners("exit").slice(),
      stdout: process.stdout.listeners("data").slice(),
      stderr: process.stderr.listeners("data").slice(),
    };
    kernel._killProcessTree.and.rejectWith(new Error("old tree survives"));
    kernel._launchFreshGeneration = jasmine.createSpy("must not launch replacement");

    expect(await kernel.restart()).toBe(false);

    expect(kernel.kernelProcess).toBe(process);
    expect(kernel.connectionFile).toBe("surviving-old.json");
    expect(process.listeners("error")).toEqual(original.error);
    expect(process.listeners("exit")).toEqual(original.exit);
    expect(process.stdout.listeners("data")).toEqual(original.stdout);
    expect(process.stderr.listeners("data")).toEqual(original.stderr);
    expect(kernel._launchFreshGeneration).not.toHaveBeenCalled();
    expect(removedFiles).not.toContain("surviving-old.json");
  });

  it("publishes one shutdown latch before reentrant cleanup and refuses a restart", async () => {
    kernel.lifecycle = "unresponsive";
    kernel.shellSocket = socket("shell");
    kernel.kernelProcess = child(100);
    let reentrant;
    kernel._clearRecovery.and.callFake(() => {
      reentrant = kernel.shutdown();
      return Promise.resolve();
    });
    kernel._launchFreshGeneration = jasmine.createSpy("must not launch");
    const shutdown = kernel.shutdown();
    const concurrent = kernel.shutdown();

    expect(reentrant).toBe(shutdown);
    expect(concurrent).toBe(shutdown);
    expect(await kernel.restart()).toBe(false);
    await shutdown;
    expect(kernel._killProcessTree).toHaveBeenCalledTimes(1);
    expect(kernel._launchFreshGeneration).not.toHaveBeenCalled();
  });

  for (const initial of [false, true]) {
    for (const killFails of [false, true]) {
      it(`${initial ? "initial startup" : "restart"} ${killFails ? "retains an abandoned child and file after failed termination" : "disposes a child and its file when launch finishes after destruction"}`, async () => {
        const launched = deferred();
        const entered = deferred();
        const late = child(300);
        const launch = jasmine.createSpy("delayed launch").and.callFake(() => {
          entered.resolve();
          return launched.promise;
        });
        if (initial) kernel._launchInitialGeneration = launch;
        else kernel._launchFreshGeneration = launch;
        kernel._killProcessTree.and.callFake(async (value) => {
          if (value !== late) return;
          if (killFails) throw new Error("abandoned process survives");
          value.exitCode = 0;
        });
        const started = jasmine.createSpy("must not announce abandoned startup");
        const pending = initial ? owner.start({}, started) : kernel.restart(started);
        await entered.promise;
        kernel._destroyed = true;
        launched.resolve(generation(late, "abandoned-owned.json"));
        await pending;

        expect(kernel.connect).not.toHaveBeenCalled();
        expect(started).not.toHaveBeenCalled();
        expect(kernel._executeStartupCode).not.toHaveBeenCalled();
        expect(kernel._connectionGeneration).toBe(1);
        if (killFails) {
          expect(kernel.kernelProcess).toBe(late);
          expect(kernel.connectionFile).toBe("abandoned-owned.json");
          expect(removedFiles).not.toContain("abandoned-owned.json");
          expect(kernel.lifecycle).toBe("unresponsive");
        } else {
          expect(kernel.kernelProcess).toBeNull();
          expect(removedFiles).toContain("abandoned-owned.json");
        }
      });
    }
  }

  it("ignores queued callbacks from a replaced child's process and output streams", () => {
    const old = child(100);
    kernel.kernelProcess = old;
    kernel.monitorNotifications(old);
    const callbacks = {
      error: old.listeners("error").slice(),
      exit: old.listeners("exit").slice(),
      stdout: old.stdout.listeners("data").slice(),
      stderr: old.stderr.listeners("data").slice(),
    };
    const fresh = child(200);
    kernel.kernelProcess = fresh;
    kernel._connectionGeneration++;
    kernel.connectionFile = "fresh-owned.json";
    for (const callback of callbacks.error) callback(new Error("old process error"));
    for (const callback of callbacks.exit) callback(1, null);
    for (const callback of callbacks.stdout) callback(Buffer.from("old output"));
    for (const callback of callbacks.stderr) callback(Buffer.from("old traceback"));

    expect(kernel.kernelProcess).toBe(fresh);
    expect(kernel.connectionFile).toBe("fresh-owned.json");
    expect(kernel.lifecycle).toBe("ready");
    expect(kernel._clearState).not.toHaveBeenCalled();
    expect(kernel._stopReadyProbe).not.toHaveBeenCalled();
    expect(kernel._stopAckWatchdog).not.toHaveBeenCalled();
    expect(lumine.notifications.addInfo).not.toHaveBeenCalled();
    expect(lumine.notifications.addError).not.toHaveBeenCalled();
    expect(removedFiles).toEqual([]);
  });

  it("cannot complete or dispose the current readiness round from saved old callbacks", () => {
    const oldShell = socket("old-shell");
    const oldIO = socket("old-iopub");
    kernel.shellSocket = oldShell;
    kernel.ioSocket = oldIO;
    kernel._startReadyProbe = jasmine.createSpy("arm readiness");
    kernel._startAckWatchdog = jasmine.createSpy("arm watchdog");
    kernel._discardReadyProbes = jasmine.createSpy("discard current probes");
    const oldStarted = jasmine.createSpy("old ready");
    const started = jasmine.createSpy("current ready");
    ZMQKernel.prototype.monitor.call(kernel, oldStarted);
    const oldID = `ready_probe_${kernel._readyGeneration}_old`;
    const oldReply = oldShell.listeners("message")[0];
    const oldIdle = oldIO.listeners("message")[0];
    kernel._cancelReadiness();
    kernel._connectionGeneration++;
    const shell = socket("new-shell");
    const io = socket("new-iopub");
    kernel.shellSocket = shell;
    kernel.ioSocket = io;
    kernel.setLifecycle("restarting");
    ZMQKernel.prototype.monitor.call(kernel, started, true);
    const cancelCurrent = kernel._cancelReadiness;
    const reply = (id) => ({
      header: { msg_type: "kernel_info_reply" },
      parent_header: { msg_id: id },
    });
    const idle = (id) => ({
      header: { msg_type: "status" },
      parent_header: { msg_id: id },
      content: { execution_state: "idle" },
    });

    oldReply(reply(oldID));
    oldIdle(idle(oldID));

    expect(oldStarted).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
    expect(kernel.lifecycle).toBe("restarting");
    expect(kernel._discardReadyProbes).not.toHaveBeenCalled();
    expect(kernel._startAckWatchdog).not.toHaveBeenCalled();
    expect(kernel._cancelReadiness).toBe(cancelCurrent);
    expect(shell.listenerCount("message")).toBe(1);
    expect(io.listenerCount("message")).toBe(1);

    const currentID = `ready_probe_${kernel._readyGeneration}_current`;
    shell.emit("message", reply(currentID));
    io.emit("message", idle(currentID));
    expect(started).toHaveBeenCalledTimes(1);
    expect(oldStarted).not.toHaveBeenCalled();
    expect(kernel.lifecycle).toBe("ready");
  });

  it("detaches only its own listeners and keeps the old pipes draining", () => {
    const process = child(100);
    const externalError = () => {};
    const externalExit = () => {};
    const externalOutput = () => {};
    process.on("error", externalError);
    process.on("exit", externalExit);
    process.stdout.on("data", externalOutput);
    process.stderr.on("data", externalOutput);
    kernel.kernelProcess = process;
    kernel.monitorNotifications(process);
    process.stdout.pause();
    process.stderr.pause();

    owner.detachProcess(process);

    expect(process.listeners("error")).toEqual([externalError]);
    expect(process.listeners("exit")).toEqual([externalExit]);
    expect(process.stdout.listeners("data")).toEqual([externalOutput]);
    expect(process.stderr.listeners("data")).toEqual([externalOutput]);
    expect(process.stdout.readableFlowing).toBe(true);
    expect(process.stderr.readableFlowing).toBe(true);
  });

  it("keeps a failed destroy's child reachable for another cleanup attempt", async () => {
    const process = child(100);
    kernel.kernelProcess = process;
    kernel.connectionFile = "still-owned.json";
    kernel._destroyed = true;
    kernel._killProcessTree.and.rejectWith(new Error("process tree survives"));

    await owner.destroy(false, Promise.resolve(), true);

    expect(kernel.kernelProcess).toBe(process);
    expect(kernel.connectionFile).toBe("still-owned.json");
  });
});
