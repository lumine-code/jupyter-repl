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
    emit(event) {
      for (const listener of this.listeners[event] || []) listener({});
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
