const path = require("node:path");

describe("monitor restoration before the real runtime bootstrap", () => {
  let pack, monitor, editor, kernel, subscription;
  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    pack = lumine.packages.loadPackage(path.resolve(__dirname, ".."));
  });
  afterEach(async () => {
    subscription?.dispose();
    kernel?.destroy();
    editor?.destroy();
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    await lumine.fileWatchClient.settlePendingTeardown();
  });

  it("restores inert UI through the manifest and connects to the activation emitter afterwards", async () => {
    const initialPackages = spyOn(lumine.packages, "hasActivatedInitialPackages").and.returnValue(
      false,
    );
    monitor = lumine.deserializers.deserialize({ deserializer: "jupyter-repl/KernelMonitorPane" });
    expect(monitor).toBeTruthy();
    expect(pack.mainInitialized).toBe(true);
    expect(pack.mainActivated).toBe(false);
    expect(monitor.component.provider.getRunningKernels()).toEqual([]);
    expect(monitor.serialize()).toEqual({ deserializer: "jupyter-repl/KernelMonitorPane" });
    initialPackages.and.callThrough();
    await lumine.packages.activatePackage(pack.name);
    for (let turn = 0; turn < 8; turn++) await Promise.resolve();
    const main = pack.mainModule;
    const provider = main.provideJupyterKernel();
    expect(monitor.component.provider).toBe(provider);
    const seen = [];
    expect(() => {
      subscription = provider.onDidChangeKernel((value) => seen.push(value));
    }).not.toThrow();
    editor = await lumine.workspace.open();
    const KernelTransport = require("../lib/kernel-transport");
    const Kernel = require("../lib/kernel");
    const transport = new KernelTransport(
      { display_name: "Restored session", language: "python" },
      editor.getGrammar(),
    );
    transport.setLifecycle("ready");
    transport.setExecutionState("idle");
    kernel = new Kernel(transport);
    const store = require("../lib/store");
    store.newKernel(kernel, `Unsaved Editor ${editor.id}`, editor, editor.getGrammar());
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    expect(seen.at(-1)).toBe(kernel.getPluginWrapper());
    expect(provider.getActiveKernel()).toBe(kernel.getPluginWrapper());
    expect(monitor.component.provider.getRunningKernels()).toContain(kernel.getPluginWrapper());
  });
});
