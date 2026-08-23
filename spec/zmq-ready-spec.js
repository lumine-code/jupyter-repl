const ZMQKernel = require("../lib/zmq-kernel");

// A launch used to complete only when the zeromq socket monitor delivered its
// connect events. The monitor is telemetry riding an inproc socket — after a
// shutdown-and-start it can fail to construct or never fire, hanging the
// launch with the kernel banner already on screen. Readiness is judged by the
// protocol now: a kernel_info probe provokes traffic, and traffic completes
// the handshake whatever the monitor thinks.

function fakeSocket() {
  return {
    isConnected: false,
    listeners: {},
    sent: [],
    on(event, listener) {
      (this.listeners[event] ??= []).push(listener);
    },
    removeListener(event, listener) {
      const listeners = this.listeners[event];
      if (!listeners) return;
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    listenerCount(event) {
      return (this.listeners[event] || []).length;
    },
    emit(event) {
      for (const listener of [...(this.listeners[event] || [])]) listener({});
    },
    async send(message) {
      this.sent.push(message);
    },
  };
}

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.executionCallbacks = {};
  kernel.states = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  kernel.shellSocket = fakeSocket();
  kernel.ioSocket = fakeSocket();
  return kernel;
}

describe("kernel launch readiness", () => {
  let kernel;

  afterEach(() => {
    kernel?._stopReadyProbe();
    kernel?._stopAckWatchdog();
    kernel = null;
  });

  it("sends a kernel_info probe as soon as it starts waiting", () => {
    kernel = bareKernel();
    kernel.monitor(() => {});

    expect(kernel.shellSocket.sent.length).toBe(1);
    const probe = Object.keys(kernel.executionCallbacks)[0];
    expect(probe.startsWith("ready_probe_")).toBe(true);
  });

  it("completes on traffic alone, without any monitor event", () => {
    kernel = bareKernel();
    let started = 0;
    kernel.monitor(() => started++);

    kernel.shellSocket.emit("message");
    expect(started).toBe(0);

    kernel.ioSocket.emit("message");
    expect(started).toBe(1);
    expect(kernel.states).toEqual(["idle"]);
    expect(kernel._readyProbe).toBe(null);
  });

  it("still completes on the monitor's connect events", () => {
    kernel = bareKernel();
    let started = 0;
    kernel.monitor(() => started++);

    kernel.shellSocket.emit("connect");
    kernel.ioSocket.emit("connect");

    expect(started).toBe(1);
  });

  it("completes once, however many signals arrive", () => {
    kernel = bareKernel();
    let started = 0;
    kernel.monitor(() => started++);

    kernel.shellSocket.emit("connect");
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");
    kernel.ioSocket.emit("connect");
    kernel.shellSocket.emit("message");

    expect(started).toBe(1);
  });

  it("waits for reconnection traffic during a restart", () => {
    kernel = bareKernel();
    kernel.shellSocket.isConnected = true;
    kernel.ioSocket.isConnected = true;
    let restarted = 0;
    kernel.monitor(() => restarted++, true);

    // Already-connected sockets must not satisfy a restart: the old kernel is
    // gone, and only the new one can produce traffic.
    expect(restarted).toBe(0);

    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");
    expect(restarted).toBe(1);
  });

  // One of the readiness listeners rides `message`, so leaving them attached
  // means calling them for every iopub message the kernel ever sends.
  it("drops its readiness listeners once the kernel is ready", () => {
    kernel = bareKernel();
    kernel.monitor(() => {});
    expect(kernel.ioSocket.listenerCount("message")).toBe(1);

    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    expect(kernel.ioSocket.listenerCount("message")).toBe(0);
    expect(kernel.ioSocket.listenerCount("connect")).toBe(0);
    expect(kernel.shellSocket.listenerCount("message")).toBe(0);
  });

  it("arms the ack watchdog once the kernel is ready", () => {
    // Not in `connect`: that runs once per object, and a restart re-enters
    // `monitor` instead. Armed there, the watchdog also spends the whole
    // launch spinning on a kernel its own gate says is not ready yet.
    kernel = bareKernel();
    kernel.monitor(() => {});
    expect(kernel._ackWatchdog).toBeFalsy();

    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    expect(kernel._ackWatchdog).not.toBe(null);
  });

  it("arms it again after a restart", () => {
    // The exit handler stops both timers when a process dies, and a kernel
    // that died and was restarted used to serve cells with no watchdog at all.
    kernel = bareKernel();
    kernel.monitor(() => {});
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");
    kernel._stopAckWatchdog();

    kernel.monitor(() => {}, true);
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    expect(kernel._ackWatchdog).not.toBe(null);
  });

  it("does not accumulate listeners across restarts", () => {
    kernel = bareKernel();
    kernel.monitor(() => {});
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    for (let restart = 0; restart < 5; restart++) {
      kernel.monitor(() => {}, true);
      expect(kernel.ioSocket.listenerCount("message")).toBe(1);
      kernel.shellSocket.emit("message");
      kernel.ioSocket.emit("message");
      expect(kernel.ioSocket.listenerCount("message")).toBe(0);
    }
  });

  it("goes quiet after destruction", () => {
    kernel = bareKernel();
    let started = 0;
    kernel.monitor(() => started++);

    kernel._destroyed = true;
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    expect(started).toBe(0);
  });
});

// The ready probe sends into the socket every 500 ms for a minute, and the ack
// watchdog's interval holds the kernel — sockets, callbacks and all — for as
// long as it runs. A process that has exited answers neither, so both have to
// stop with it, or a session accumulates one immortal kernel per death.
describe("kernel process exit", () => {
  let kernel;

  function exitingKernel(lifecycle) {
    const listeners = {};
    const childProcess = {
      stdout: { on() {} },
      stderr: { on() {} },
      on(event, listener) {
        listeners[event] = listener;
      },
      exit: (code) => listeners.exit?.(code, null),
    };

    const instance = Object.create(ZMQKernel.prototype);
    instance._destroyed = false;
    instance.lifecycle = lifecycle;
    // Both real call sites set this to the child they then monitor: the
    // constructor for the first process, `_socketRestart` for each one after.
    instance.kernelProcess = childProcess;
    instance.kernelSpec = { display_name: "Python 3" };
    instance.executionCallbacks = {};
    instance.shellSocket = null;
    instance.ioSocket = null;
    instance.stdinSocket = null;
    instance.connectionFile = null;
    instance.setLifecycle = () => {};
    instance.emitDidLoseKernel = () => {};
    instance._clearState = () => {};
    // Stand in for real timers so the spec asserts on the clearing, not on
    // whatever the frozen clock would or would not deliver.
    instance._readyProbe = setInterval(() => {}, 1000);
    instance._ackWatchdog = setInterval(() => {}, 1000);
    instance.monitorNotifications(childProcess);
    return { instance, childProcess };
  }

  afterEach(() => {
    kernel?._stopReadyProbe();
    kernel?._stopAckWatchdog();
    kernel = null;
  });

  it("stops both timers when the kernel dies", () => {
    const { instance, childProcess } = exitingKernel("ready");
    kernel = instance;

    childProcess.exit(1);

    expect(instance._readyProbe).toBe(null);
    expect(instance._ackWatchdog).toBe(null);
  });

  it("leaves the timers alone while restarting", () => {
    // A restart kills the old process and arms the new kernel's probe before
    // this event arrives, so stopping here would stop the new one.
    const { instance, childProcess } = exitingKernel("restarting");
    kernel = instance;

    childProcess.exit(0);

    expect(instance._readyProbe).not.toBe(null);
    expect(instance._ackWatchdog).not.toBe(null);
  });

  it("ignores the exit of a process it has already replaced", () => {
    // The restart's own timing race: the new process can answer, and finish()
    // can flip the lifecycle back to "ready", before the old child's exit is
    // delivered. Read as the live kernel dying, that straggler stops the
    // timers of a kernel that is up and serving cells — and the watchdog has
    // no other arming point, so it stays off for good.
    const { instance, childProcess } = exitingKernel("restarting");
    kernel = instance;
    const replacement = { exit: () => {} };
    instance.kernelProcess = replacement;
    instance.lifecycle = "ready";

    childProcess.exit(0);

    expect(instance._readyProbe).not.toBe(null);
    expect(instance._ackWatchdog).not.toBe(null);
  });

  it("still acts on the exit of the process it is currently running", () => {
    // The negative control: identity is the test, not staleness in general.
    const { instance, childProcess } = exitingKernel("ready");
    kernel = instance;

    childProcess.exit(1);

    expect(instance._readyProbe).toBe(null);
    expect(instance._ackWatchdog).toBe(null);
  });
});
