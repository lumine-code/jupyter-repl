describe("Kernel idle transition ownership", () => {
  let Kernel, KernelTransport, kernels;
  beforeEach(async () => {
    await lumine.packages.activatePackage("jupyter-repl");
    Kernel = require("../lib/kernel");
    KernelTransport = require("../lib/kernel-transport");
    kernels = [];
  });
  afterEach(async () => {
    for (const kernel of kernels) kernel.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  const create = () => {
    const transport = new KernelTransport({ language: "python", display_name: "Controlled" }, null);
    transport.setLifecycle("ready");
    const kernel = new Kernel(transport);
    kernels.push(kernel);
    return { kernel, transport };
  };
  for (const phase of ["execution", "status"]) {
    it(`does not emit a later idle event or throw when a ${phase} observer destroys the kernel`, () => {
      const { kernel, transport } = create();
      transport.setExecutionState("busy");
      const idle = jasmine.createSpy("late idle event");
      transport.onDidBecomeIdle(idle);
      if (phase === "execution")
        kernel.onDidChangeExecutionState((state) => {
          if (state === "idle") kernel.destroy();
        });
      else
        kernel.onDidChangeStatus(() => {
          if (transport.executionState === "idle") kernel.destroy();
        });
      expect(() => transport.setExecutionState("idle")).not.toThrow();
      expect(idle).not.toHaveBeenCalled();
      expect(transport.lifecycle).toBe("dead");
    });
  }
  it("still publishes a normal current idle transition once", () => {
    const { transport } = create();
    const idle = jasmine.createSpy("current idle event");
    transport.onDidBecomeIdle(idle);
    transport.setExecutionState("busy");
    transport.setExecutionState("idle");
    transport.setExecutionState("idle");
    expect(idle).toHaveBeenCalledTimes(1);
  });

  it("does not publish an obsolete idle after its state observer begins new work", () => {
    const { kernel, transport } = create();
    transport.setExecutionState("busy");
    const idle = jasmine.createSpy("obsolete idle event");
    transport.onDidBecomeIdle(idle);
    kernel.onDidChangeExecutionState((state) => {
      if (state === "idle") transport.setExecutionState("busy");
    });
    transport.setExecutionState("idle");
    expect(transport.executionState).toBe("busy");
    expect(idle).not.toHaveBeenCalled();
  });
});
