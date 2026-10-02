const KernelTransport = require("../lib/kernel-transport");
const ZMQKernel = require("../lib/zmq-kernel");

describe("connection lifecycle ownership", () => {
  it("announces terminal connection transitions once, independently of execution state", () => {
    const transport = new KernelTransport({ language: "python" }, null);
    const states = [];
    transport.onDidChangeLifecycle((state) => states.push(state));
    transport.setExecutionState("busy");
    transport.setLifecycle("ready");
    transport.setLifecycle("ready");
    transport.destroy();
    transport.destroy();
    expect(states).toEqual(["ready", "dead"]);
  });

  it("marks a rejected initial launch terminal so its owner can release subscriptions", async () => {
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.rejectWith(
      new Error("Cannot launch"),
    );
    spyOn(lumine.notifications, "addError");
    const transport = new ZMQKernel(
      { display_name: "Diagnostic kernel", language: "python" },
      null,
      {},
    );
    const states = [];
    transport.onDidChangeLifecycle((state) => states.push(state));
    for (let turn = 0; turn < 12; turn++) await Promise.resolve();
    expect(transport.lifecycle).toBe("dead");
    expect(states).toEqual(["dead"]);
    transport.destroy();
  });

  it("preserves a replacement startup's marker when an old launch fails", async () => {
    let reject;
    const launch = new Promise((_resolve, rej) => {
      reject = rej;
    });
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.returnValue(launch);
    spyOn(lumine.notifications, "addError");
    const store = require("../lib/store");
    const key = "owned-startup";
    const transport = new ZMQKernel(
      { display_name: "Diagnostic kernel", language: "python" },
      null,
      { startingKernelKey: key },
    );
    const replacement = {};
    store.startingKernels.set(key, replacement);
    try {
      reject(new Error("Old launch failed"));
      for (let turn = 0; turn < 12; turn++) await Promise.resolve();
      expect(store.startingKernels.get(key)).toBe(replacement);
    } finally {
      store.startingKernels.delete(key);
      transport.destroy();
    }
  });
});
