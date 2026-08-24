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
    emit(event, payload = {}) {
      for (const listener of [...(this.listeners[event] || [])]) listener(payload);
    },
    async send(message) {
      this.sent.push(message);
    },
  };
}

/**
 * What the kernel echoes for a probe: any message whose parent names the
 * probe's request id. The one thing a killed process cannot produce, which is
 * why a restart's readiness listens for nothing else.
 */
function probeEcho(kernel) {
  const probeId = [...kernel._readyProbeIds][0];
  return { parent_header: { msg_id: probeId, msg_type: "kernel_info_request" } };
}

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.executionCallbacks = {};
  kernel._readyProbeIds = new Set();
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

  it("completes a restart when this round's probe is answered", () => {
    kernel = bareKernel();
    kernel.shellSocket.isConnected = true;
    kernel.ioSocket.isConnected = true;
    let restarted = 0;
    kernel.monitor(() => restarted++, true);

    // Already-connected sockets must not satisfy a restart: the old kernel is
    // gone, and only the new one can produce traffic.
    expect(restarted).toBe(0);

    const echo = probeEcho(kernel);
    kernel.shellSocket.emit("message", echo);
    kernel.ioSocket.emit("message", echo);
    expect(restarted).toBe(1);
  });

  it("is not satisfied by the dead process's stragglers during a restart", () => {
    // The sockets stay connected across a restart and keep draining what the
    // killed process left behind — replies to our own old requests, buffered
    // statuses — all carrying our session. Counted as readiness, they put the
    // kernel at "ready" with nothing behind the ports.
    kernel = bareKernel();
    let restarted = 0;
    kernel.monitor(() => restarted++, true);

    kernel.shellSocket.emit("message", {
      parent_header: { msg_id: "execute_old", msg_type: "execute_request" },
    });
    kernel.ioSocket.emit("message", {
      parent_header: { msg_id: "execute_old", msg_type: "execute_request" },
    });
    // A previous round's probe is a straggler too: the old process may have
    // answered it just as the user restarted.
    kernel.shellSocket.emit("message", {
      parent_header: { msg_id: "ready_probe_0_stale", msg_type: "kernel_info_request" },
    });

    expect(restarted).toBe(0);
  });

  it("does not let a reconnect event stand in for the new process answering", () => {
    // The sockets reconnect the moment the new process binds its ports, which
    // says nothing about the kernel behind them serving yet.
    kernel = bareKernel();
    let restarted = 0;
    kernel.monitor(() => restarted++, true);

    kernel.shellSocket.emit("connect");
    kernel.ioSocket.emit("connect");

    expect(restarted).toBe(0);
  });

  it("still takes the fast paths on first launch", () => {
    // First launch has no dead process to drain, so any traffic — and the
    // Observer's connect events — remain honest evidence there.
    kernel = bareKernel();
    let started = 0;
    kernel.monitor(() => started++);

    kernel.shellSocket.emit("connect");
    kernel.ioSocket.emit("message");

    expect(started).toBe(1);
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

  it("keeps the status bar still while it waits", () => {
    // A slow start would otherwise flash the bar every 500 ms, and on a
    // restart each pair fires did-become-idle — every watch refetching
    // against a kernel that has not run its startup code yet.
    kernel = bareKernel();
    kernel.monitor(() => {});

    const requestId = Object.keys(kernel.executionCallbacks)[0];
    expect(kernel.executionCallbacks[requestId].suppressStatus).toBe(true);
  });

  it("keeps at most one probe outstanding", () => {
    kernel = bareKernel();
    kernel.monitor(() => {});
    window.advanceClock(1600);

    expect(Object.keys(kernel.executionCallbacks).length).toBe(1);
  });

  it("gives up on a kernel that never answers and routes it into the exit path", () => {
    // A minute of unanswered probes used to stop in silence: the kernel hung
    // in "loading" forever, its display name stuck in startingKernels, and
    // every later attempt to start that spec was refused without a word.
    spyOn(lumine.notifications, "addError");
    const store = require("../lib/store");
    store.startingKernels.set("Python 3", true);
    kernel = bareKernel();
    kernel.kernelSpec = { display_name: "Python 3" };
    kernel.lifecycle = "loading";
    kernel.killed = false;
    kernel._kill = () => {
      kernel.killed = true;
    };

    try {
      kernel.monitor(() => {});
      // Tick by tick: one advanceClock call fires a fake interval once,
      // however far it moves.
      for (let tick = 0; tick < 125; tick++) {
        window.advanceClock(500);
      }

      expect(kernel._readyProbe).toBe(null);
      expect(kernel.killed).toBe(true);
      expect(kernel._expectingExit).toBe(true);
      expect(store.startingKernels.has("Python 3")).toBe(false);
      expect(lumine.notifications.addError).toHaveBeenCalled();
    } finally {
      store.startingKernels.delete("Python 3");
    }
  });

  it("leaves no probe behind once the kernel is ready", () => {
    // Nothing else would reclaim them: the watchdog settles what a caller is
    // waiting for, and no one waits on a probe.
    kernel = bareKernel();
    kernel.monitor(() => {});
    expect(Object.keys(kernel.executionCallbacks).length).toBe(1);

    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
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

    expect(kernel._ackWatchdog).toBeTruthy();
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
    const echo = probeEcho(kernel);
    kernel.shellSocket.emit("message", echo);
    kernel.ioSocket.emit("message", echo);

    expect(kernel._ackWatchdog).toBeTruthy();
  });

  it("does not accumulate listeners across restarts", () => {
    kernel = bareKernel();
    kernel.monitor(() => {});
    kernel.shellSocket.emit("message");
    kernel.ioSocket.emit("message");

    for (let restart = 0; restart < 5; restart++) {
      kernel.monitor(() => {}, true);
      expect(kernel.ioSocket.listenerCount("message")).toBe(1);
      const echo = probeEcho(kernel);
      kernel.shellSocket.emit("message", echo);
      kernel.ioSocket.emit("message", echo);
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
    // A kernel that is "ready" or "restarting" has been ready before; only
    // "loading" means its own first startup is still in flight.
    instance._everReady = lifecycle !== "loading";
    instance._expectingExit = false;
    // Both real call sites set this to the child they then monitor: the
    // constructor for the first process, `_socketRestart` for each one after.
    instance.kernelProcess = childProcess;
    instance.kernelSpec = { display_name: "Python 3" };
    instance.executionCallbacks = {};
    instance._readyProbeIds = new Set();
    instance.shellSocket = null;
    instance.ioSocket = null;
    instance.stdinSocket = null;
    instance.connectionFile = null;
    instance.lost = [];
    instance.cleared = [];
    instance.setLifecycle = (value) => {
      instance.lifecycle = value;
    };
    instance.emitDidLoseKernel = (reason) => instance.lost.push(reason);
    instance._clearState = (reason) => instance.cleared.push(reason);
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

  it("declares the restart failed when the new process dies", () => {
    // Only the new process can reach this handler while restarting — the
    // identity guard filters the one the restart killed. Left unhandled, the
    // probe exhausted in silence and the restart reentry guard swallowed
    // every retry: the kernel wedged in "restarting" for the window's life.
    spyOn(lumine.notifications, "addError");
    const { instance, childProcess } = exitingKernel("restarting");
    kernel = instance;

    childProcess.exit(1);

    expect(instance._readyProbe).toBe(null);
    expect(instance._ackWatchdog).toBe(null);
    expect(instance.lifecycle).toBe("dead");
    expect(instance.lost).toEqual(["Kernel process died during restart"]);
    expect(instance.cleared).toEqual(["Kernel process died during restart"]);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("keeps quiet about the exit a shutdown asked for", () => {
    // Whatever the exit code says, an exit the user requested is not a
    // crash, and announcing it as one taught people to ignore the real ones.
    spyOn(lumine.notifications, "addError");
    const { instance, childProcess } = exitingKernel("ready");
    kernel = instance;
    instance._expectingExit = true;

    childProcess.exit(1);

    expect(instance.lifecycle).toBe("dead");
    expect(instance.lost).toEqual(["Kernel shut down"]);
    expect(instance.cleared).toEqual(["Kernel shut down"]);
    expect(lumine.notifications.addError).not.toHaveBeenCalled();
  });

  it("settles a running kernel's crash even while a same-name kernel starts", () => {
    // `startingKernels` is keyed by display name, and two kernels of one
    // spec is the normal multi-file state. Keyed on the name, a running
    // kernel dying during its sibling's startup window was classed as a
    // failed start: no lose event — its cells spun forever — and the
    // sibling's starting marker deleted from under it.
    const store = require("../lib/store");
    store.startingKernels.set("Python 3", true);
    const { instance, childProcess } = exitingKernel("ready");
    kernel = instance;

    try {
      childProcess.exit(1);

      expect(instance.lost).toEqual(["Kernel process exited"]);
      expect(store.startingKernels.has("Python 3")).toBe(true);
    } finally {
      store.startingKernels.delete("Python 3");
    }
  });

  it("cleans up its own failed start", () => {
    const store = require("../lib/store");
    store.startingKernels.set("Python 3", true);
    const { instance, childProcess } = exitingKernel("loading");
    kernel = instance;

    try {
      childProcess.exit(1);

      expect(store.startingKernels.has("Python 3")).toBe(false);
      expect(instance.lost).toEqual([]);
    } finally {
      store.startingKernels.delete("Python 3");
    }
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
