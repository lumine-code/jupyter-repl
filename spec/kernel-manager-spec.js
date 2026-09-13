const { KernelManager } = require("../lib/kernel-manager");

describe("KernelManager kernel selection", () => {
  let manager;

  beforeEach(() => {
    manager = new KernelManager();
    spyOn(manager, "getAllKernelSpecsForGrammar").and.returnValue(
      Promise.resolve([
        { name: "python3", display_name: "Python 3" },
        { name: "ir", display_name: "R" },
      ]),
    );
  });

  afterEach(() => manager.kernelPicker?.destroy());

  it("resolves a pending selection as null when the picker is cancelled", async () => {
    const pending = manager.getKernelSpecForGrammar({ name: "Python" }, null);
    await Promise.resolve();
    await Promise.resolve();

    expect(manager.kernelPicker).toBeDefined();
    manager.kernelPicker.selectListHost.cancel();

    await expectAsync(pending).toBeResolvedTo(null);
    expect(manager.kernelPicker.onConfirmed).toBeNull();
    expect(manager.kernelPicker.onCancelled).toBeNull();
  });

  it("derives an adapter kernel's working directory from the notebook owner", () => {
    const notebook = { getPath: () => "C:\\work\\notebooks\\analysis.ipynb" };
    spyOn(lumine.config, "get").and.callFake((key) =>
      key === "jupyter-repl.startDir" ? "dirOfFile" : undefined,
    );

    expect(manager.getKernelStartDirectory(notebook)).toBe("C:\\work\\notebooks");
  });
});
