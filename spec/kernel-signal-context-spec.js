describe("public kernel signal command context", () => {
  let store, AdapterKernelBinding, mainModule, requireCurrent, inputController;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const pack = lumine.packages.loadPackage("jupyter-repl");
    pack.requireMainModule();
    mainModule = pack.mainModule;
    requireCurrent = require("node:module").createRequire(
      require("node:path").join(pack.path, "package.json"),
    );
    const createInput = spyOn(
      requireCurrent("./lib/ui/input-controller"),
      "createInputController",
    ).and.callThrough();
    await lumine.packages.activatePackage("jupyter-repl");
    inputController = createInput.calls.mostRecent().returnValue;
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

  for (const command of ["rename-remote-session", "disconnect-remote-session"]) {
    it(`routes ${command} to the invoking window's remote session`, async () => {
      const rename = spyOn(inputController, "renameSession");
      const session = () => ({
        capabilities: { rename: true, disconnect: true },
        disconnect: jasmine.createSpy("disconnect session"),
      });
      const firstSession = session();
      const otherSession = session();
      const first = {
        executionState: "idle",
        transport: { rename() {}, ownsKernelProcess: false },
        getPluginWrapper: () => firstSession,
        destroy() {},
      };
      const second = {
        executionState: "idle",
        transport: { rename() {}, ownsKernelProcess: false },
        getPluginWrapper: () => otherSession,
        destroy() {},
      };
      store.runningKernels = [first, second];
      const item = (kernel) => ({
        getTitle: () => "Kernel Client",
        getJupyterKernel: () => kernel,
        element: document.createElement("div"),
      });
      await lumine.workspace.open(item(first));
      const main = lumine.workspace.getMainWindow();
      const otherItem = item(second);
      await lumine.workspace.open(otherItem, { split: "right" });
      await lumine.workspace.detachPane(lumine.workspace.paneForItem(otherItem));
      store.updateActivePaneItem(otherItem);

      await lumine.commands.dispatch(main.getElement(), `jupyter-repl:${command}`);

      if (command === "rename-remote-session") {
        expect(rename).toHaveBeenCalledWith(firstSession);
        expect(rename).toHaveBeenCalledTimes(1);
      } else {
        expect(firstSession.disconnect).toHaveBeenCalledTimes(1);
        expect(otherSession.disconnect).not.toHaveBeenCalled();
      }
    });
  }

  for (const [command, method] of [
    ["open-terminal", "openJupyterConsole"],
    ["spawn-terminal", "spawnJupyterConsole"],
    ["copy-console-command", "copyJupyterConsoleCommand"],
  ]) {
    it(`captures the invoking window's kernel for ${command}`, async () => {
      const kernel = () => ({
        executionState: "idle",
        transport: { connectionFile: "kernel.json" },
        destroy() {},
      });
      const first = kernel();
      const second = kernel();
      store.runningKernels = [first, second];
      const item = (value) => ({
        getTitle: () => "Kernel Client",
        getJupyterKernel: () => value,
        element: document.createElement("div"),
      });
      await lumine.workspace.open(item(first));
      const main = lumine.workspace.getMainWindow();
      const otherItem = item(second);
      await lumine.workspace.open(otherItem, { split: "right" });
      await lumine.workspace.detachPane(lumine.workspace.paneForItem(otherItem));
      store.updateActivePaneItem(otherItem);
      const terminal = mainModule.consumeTerminal({});
      const spawn = mainModule.consumeTerminalSpawn({});
      const launch = spyOn(requireCurrent("./lib/launch-jupyter"), method).and.resolveTo();
      try {
        await lumine.commands.dispatch(main.getElement(), `jupyter-repl:${command}`);
        const args = launch.calls.mostRecent().args;
        const context = args[args.length - 1];
        expect(context.kernel).toBe(first);
      } finally {
        terminal.dispose();
        spawn.dispose();
      }
    });
  }
});
