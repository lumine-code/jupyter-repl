describe("public kernel signal command context", () => {
  let store, AdapterKernelBinding;
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const pack = await lumine.packages.activatePackage("jupyter-repl");
    const requireCurrent = require("node:module").createRequire(
      require("node:path").join(pack.path, "package.json"),
    );
    store = requireCurrent("./lib/store");
    AdapterKernelBinding = requireCurrent("./lib/adapter-kernel-binding");
  });
  afterEach(async () => {
    await lumine.workspace.discardEditorWindows();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("uses the invoking notebook adapter and retains its execution cancellation", () => {
    const adapter = {};
    const context = { owner: {} };
    const kernel = { interrupt: jasmine.createSpy("interrupt") };
    const documents = {
      getActiveAdapter: jasmine.createSpy("other active adapter"),
      getAdapterKey: jasmine.createSpy("adapter key").and.returnValue("own-notebook"),
      getMappedKernel: jasmine.createSpy("mapped kernel").and.returnValue(kernel),
      getAdapterContext: () => context,
    };
    const cancelTargets = jasmine.createSpy("cancel notebook execution");
    const external = { setExternalKernel: jasmine.createSpy("external kernel") };
    const binding = new AdapterKernelBinding({
      store: external,
      documents,
      cancelTargets,
    });
    expect(binding.handleAdapterKernelCommand([], "interrupt-kernel", adapter)).toBe(true);
    expect(documents.getActiveAdapter).not.toHaveBeenCalled();
    expect(documents.getAdapterKey).toHaveBeenCalledWith(adapter);
    expect(cancelTargets).toHaveBeenCalledWith(adapter, kernel, "interrupted");
    expect(external.setExternalKernel).toHaveBeenCalledWith(kernel, context);
    expect(kernel.interrupt).toHaveBeenCalledTimes(1);
  });

  for (const [command, method] of [
    ["interrupt-kernel", "interrupt"],
    ["restart-kernel", "restart"],
    ["shutdown-kernel", "shutdownAndDestroy"],
  ]) {
    it(`routes ${command} to the invoking window instead of the shared kernel`, async () => {
      const kernel = () => ({
        interrupt: jasmine.createSpy("interrupt"),
        restart: jasmine.createSpy("restart"),
        shutdownAndDestroy: jasmine.createSpy("shutdown"),
        destroy() {},
        executionState: "idle",
      });
      const first = kernel();
      const second = kernel();
      store.runningKernels = [first, second];
      const item = (value) => ({
        getTitle: () => "Kernel Client",
        getJupyterKernel: () => value,
        canCopy: () => false,
        element: document.createElement("div"),
      });
      await lumine.workspace.open(item(first));
      const main = lumine.workspace.getMainWindow();
      const otherItem = item(second);
      await lumine.workspace.open(otherItem, { split: "right" });
      const other = await lumine.workspace.detachPane(lumine.workspace.paneForItem(otherItem));
      store.updateActivePaneItem(otherItem);
      await lumine.commands.dispatch(main.getElement(), `jupyter-repl:${command}`);
      expect(first[method]).toHaveBeenCalledTimes(1);
      expect(second[method]).not.toHaveBeenCalled();
      await lumine.commands.dispatch(other.getElement(), `jupyter-repl:${command}`);
      expect(first[method]).toHaveBeenCalledTimes(1);
      expect(second[method]).toHaveBeenCalledTimes(1);
    });
  }
});
