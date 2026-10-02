const path = require("path");

describe("KernelManager kernel selection", () => {
  let manager;

  beforeEach(() => {
    // Bootstrap specs unload the package and its module graph. Pair the
    // manager with the same current store generation this case observes.
    const { KernelManager } = require("../lib/kernel-manager");
    manager = new KernelManager();
    spyOn(manager, "getAllKernelSpecsForGrammar").and.returnValue(
      Promise.resolve([
        { name: "python3", display_name: "Python 3" },
        { name: "ir", display_name: "R" },
      ]),
    );
  });

  afterEach(() => manager.dispose());

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
    const notebookDirectory = path.join(path.parse(process.cwd()).root, "work", "notebooks");
    const notebook = { getPath: () => path.join(notebookDirectory, "analysis.ipynb") };
    spyOn(lumine.config, "get").and.callFake((key) =>
      key === "jupyter-repl.startDir" ? "dirOfFile" : undefined,
    );

    expect(manager.getKernelStartDirectory(notebook)).toBe(notebookDirectory);
  });

  it("settles a replaced picker request before opening the next request", async () => {
    const first = manager.getKernelSpecForGrammar({ name: "Python" }, null);
    await Promise.resolve();
    await Promise.resolve();
    const second = manager.getKernelSpecForGrammar({ name: "R" }, null);
    await Promise.resolve();
    await Promise.resolve();

    await expectAsync(first).toBeResolvedTo(null);
    const spec = { name: "ir", display_name: "R" };
    manager.kernelPicker.selectKernel(spec);
    await expectAsync(second).toBeResolvedTo(spec);
  });

  it("settles an open picker request when the manager is disposed", async () => {
    const pending = manager.getKernelSpecForGrammar({ name: "Python" }, null);
    await Promise.resolve();
    await Promise.resolve();
    const picker = manager.kernelPicker;
    manager.dispose();
    await expectAsync(pending).toBeResolvedTo(null);
    expect(picker.destroyed).toBe(true);
    expect(manager.kernelPicker).toBeNull();
  });

  it("does not open a picker when discovery completes after disposal", async () => {
    let finishDiscovery;
    manager.getAllKernelSpecsForGrammar.and.returnValue(
      new Promise((resolve) => (finishDiscovery = resolve)),
    );
    const pending = manager.getKernelSpecForGrammar({ name: "Python" }, null);
    manager.dispose();
    finishDiscovery([{ name: "python3", display_name: "Python 3" }]);
    await expectAsync(pending).toBeResolvedTo(null);
    expect(manager.kernelPicker).toBeNull();
  });

  it("coalesces concurrent discovery scans", async () => {
    const fs = require("fs");
    let finishScan;
    spyOn(fs.promises, "readdir").and.returnValue(new Promise((resolve) => (finishScan = resolve)));
    const first = manager.update();
    const scans = fs.promises.readdir.calls.count();
    const second = manager.update();
    expect(fs.promises.readdir.calls.count()).toBe(scans);
    finishScan([]);
    expect(await first).toEqual([]);
    expect(await second).toEqual([]);
  });

  it("cancels an editor's pending launch and releases its launch marker", async () => {
    const ZMQKernel = require("../lib/zmq-kernel");
    const store = require("../lib/store");
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.returnValue(new Promise(() => {}));
    const editor = await lumine.workspace.open();
    const transport = manager.startKernel(
      { display_name: "Python 3", language: "python", argv: ["python"] },
      { name: "Python", scopeName: "source.python" },
      editor,
      `Unsaved Editor ${editor.id}`,
    );
    expect(manager._pendingStarts.has(transport)).toBe(true);
    expect(store.startingKernels.has(editor)).toBe(true);
    editor.destroy();
    expect(transport._destroyed).toBe(true);
    expect(manager._pendingStarts.has(transport)).toBe(false);
    expect(store.startingKernels.has(editor)).toBe(false);
  });

  it("allows different editors to start kernels sharing one display name", async () => {
    const ZMQKernel = require("../lib/zmq-kernel");
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.returnValue(new Promise(() => {}));
    const first = await lumine.workspace.open();
    const second = await lumine.workspace.open();
    const spec = { display_name: "Python 3", language: "python", argv: ["python"] };
    const grammar = { name: "Python", scopeName: "source.python" };
    const a = manager.startKernel(spec, grammar, first, `Unsaved Editor ${first.id}`);
    const b = manager.startKernel(spec, grammar, second, `Unsaved Editor ${second.id}`);
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).not.toBe(b);
    manager.dispose();
    expect(a._destroyed).toBe(true);
    expect(b._destroyed).toBe(true);
    first.destroy();
    second.destroy();
  });

  it("deduplicates a shared global kernel's pending launch across editors", async () => {
    const ZMQKernel = require("../lib/zmq-kernel");
    const store = require("../lib/store");
    const previousGlobalMode = store.globalMode;
    spyOn(ZMQKernel.prototype, "_launchInitialGeneration").and.returnValue(new Promise(() => {}));
    const first = await lumine.workspace.open();
    const second = await lumine.workspace.open();
    const spec = { display_name: "Python 3", language: "python", argv: ["python"] };
    const grammar = { name: "Python", scopeName: "source.python" };
    try {
      store.globalMode = true;
      const transport = manager.startKernel(spec, grammar, first, `Unsaved Editor ${first.id}`);
      expect(transport.startingKernelKey).toBe("Python 3");
      expect(
        manager.startKernel(spec, grammar, second, `Unsaved Editor ${second.id}`),
      ).toBeUndefined();
      expect(manager._pendingStarts.size).toBe(1);
      manager.dispose();
      expect(store.startingKernels.has("Python 3")).toBe(false);
    } finally {
      store.globalMode = previousGlobalMode;
      first.destroy();
      second.destroy();
    }
  });
});
