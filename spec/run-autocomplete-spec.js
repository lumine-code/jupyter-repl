const path = require("node:path");
const { Disposable, Emitter } = require("lumine");

describe("Run autocomplete cancellation boundary", () => {
  let main, store, integration, editor, commands, events, calls, executions;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pkg = await lumine.packages.activatePackage(path.join(__dirname, ".."));
    main = pkg.mainModule;
    store = require("../lib/store");
    integration = require("../lib/adapter-integration");
    editor = await lumine.workspace.open();
    editor.setText("a1");
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    editor.element.focus();
    events = new Emitter();
    calls = [];
    executions = [];
    commands = lumine.commands.add(editor.element, {
      "autocomplete:cancel": (event) => {
        event.stopPropagation();
        calls.push("cancel");
      },
    });
  });

  afterEach(async () => {
    for (const execution of executions) execution.dispose();
    commands.dispose();
    integration.disposeAdapterIntegration();
    events.emit("destroy");
    events.dispose();
    await lumine.packages.deactivatePackage("jupyter-repl");
    editor.destroy();
  });

  function execution(manager, resolvers = []) {
    const service = require("../lib/services/provided/execution").provideJupyterExecution({
      store,
      kernelManager: manager,
      getAdapterServices: () => resolvers,
    });
    executions.push(service);
    return service;
  }

  function adapter() {
    const target = { id: "cell", type: "code", executable: true, source: "a1", editor, row: 0 };
    const owner = {
      id: "autocomplete-notebook",
      getPath: () => "C:/work/autocomplete-run.ipynb",
      isDestroyed: () => false,
      onDidDestroy: (callback) => events.on("destroy", callback),
      onDidChangePath: () => new Disposable(),
    };
    const pane = { isDestroyed: () => false };
    return {
      target,
      getPaneItem: () => pane,
      getKernelOwner: () => owner,
      getPath: () => owner.getPath(),
      getTitle: () => "Autocomplete notebook",
      getActiveTargetId: () => target.id,
      getKernelTarget: () => target,
      getRunTarget: () => target,
      getRunTargets: () => [target],
      getKernelLanguage: () => "python",
      getKernelGrammar: () => ({ name: "Python", scopeName: "source.python" }),
      getMetadata: () => ({
        kernelspec: { name: "python3", language: "python", display_name: "Python 3" },
      }),
      getNextRunTarget: () => null,
    };
  }

  function waitingManager() {
    return {
      getAllKernelSpecs: () => {
        calls.push("choose kernel");
        return new Promise(() => {});
      },
    };
  }

  function notebookCommands(current) {
    const manager = waitingManager();
    const resolvers = [
      {
        getActiveAdapter: () => current,
        getAdapterForItem: (item) => (item === current.getPaneItem() ? current : null),
      },
    ];
    const service = execution(manager, resolvers);
    integration.activateAdapterIntegration();
    return require("../lib/run-commands").createRunCommands({
      store,
      kernelManager: manager,
      getExecution: () => service,
      getCellsService: () => null,
      getIntegration: () => integration,
      getAdapters: () => resolvers,
      isCurrent: () => true,
    });
  }

  it("cancels before asynchronous source preparation and preserves newer completion intent", async () => {
    let finishPreparation;
    editor.setSelectedBufferRange([
      [0, 0],
      [0, 2],
    ]);
    const cells = main.consumeJupyterCells({
      getCellDescriptors: () => [],
      getExecutionBlocks: () => {
        calls.push("prepare");
        return new Promise((resolve) => {
          finishPreparation = resolve;
        });
      },
    });
    const rendered = spyOn(require("../lib/result"), "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
    });
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, {}]]));
    try {
      const pending = main.run(false, { target: editor.element });
      expect(calls[0]).toBe("cancel");
      for (let pass = 0; pass < 10 && !finishPreparation; pass++) await Promise.resolve();
      expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("prepare"));
      const cancellations = calls.filter((item) => item === "cancel").length;
      finishPreparation([{ code: "a1", row: 0, cellType: "code" }]);
      const receipt = await pending;
      expect(receipt.accepted).toBe(true);
      expect((await receipt.done).status).toBe("ok");
      expect(rendered).toHaveBeenCalled();
      expect(calls.filter((item) => item === "cancel").length).toBe(cancellations);
    } finally {
      cells.dispose();
    }
  });

  it("cancels a notebook invocation before preparing move-down or selecting a kernel", async () => {
    const current = adapter();
    const codeManager = require("../lib/code-manager");
    spyOn(codeManager, "findCodeBlock").and.returnValue({ code: "a1", row: 0 });
    spyOn(codeManager, "moveDown").and.callFake(() => calls.push("move"));
    const receipt = await notebookCommands(current).run(true, { target: editor.element });
    expect(receipt.accepted).toBe(true);
    expect(calls[0]).toBe("cancel");
    expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("move"));
  });

  it("cancels an empty notebook invocation before any kernel selection", async () => {
    const current = adapter();
    current.getRunTargets = () => [];
    const receipt = await notebookCommands(current).runAllAboveInline({ target: editor.element });
    expect(receipt.accepted).toBe(true);
    expect(calls[0]).toBe("cancel");
    if (calls.includes("choose kernel"))
      expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("choose kernel"));
  });

  it("analyzes notebook selections with that notebook's captured kernel", async () => {
    const current = adapter();
    const bound = { language: "python" };
    store.kernelMapping.set(current.getPath(), bound);
    const find = spyOn(require("../lib/code-manager"), "findCodeBlock").and.callFake(() => {
      store.kernelMapping.delete(current.getPath());
      return { code: "a1", row: 0 };
    });
    const receipt = await notebookCommands(current).run(false, { target: editor.element });
    expect(receipt.accepted).toBe(true);
    expect(find).toHaveBeenCalled();
    expect(find.calls.mostRecent().args[2].kernel).toBe(bound);
  });

  it("cancels an atomic recalculation request before waiting for restart", async () => {
    let finishRestart;
    const kernel = {
      restart: () => {
        calls.push("restart");
        return new Promise((resolve) => {
          finishRestart = resolve;
        });
      },
    };
    spyOnProperty(store, "kernel", "get").and.returnValue(kernel);
    spyOn(require("../lib/result"), "clearResults");
    const service = execution({});
    const receipt = await service.execute({
      editor,
      blocks: [{ code: "a1", row: 0, cellType: "code" }],
      restart: true,
      clear: true,
    });
    expect(calls[0]).toBe("cancel");
    expect(calls.indexOf("cancel")).toBeLessThan(calls.indexOf("restart"));
    finishRestart(false);
    expect((await receipt.done).status).toBe("unavailable");
  });

  it("does not cancel newer completions when a delayed kernel becomes ready", async () => {
    let select;
    const service = execution({
      startKernelFor: () =>
        new Promise((resolve) => {
          select = resolve;
        }),
    });
    const rendered = spyOn(require("../lib/result"), "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
    });
    const receipt = await service.execute({
      editor,
      blocks: [{ code: "a1", row: 0, cellType: "code" }],
    });
    expect(calls).toEqual(["cancel"]);
    calls.length = 0;
    const readyKernel = {};
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, readyKernel]]));
    select(readyKernel);
    expect((await receipt.done).status).toBe("ok");
    expect(calls).toEqual([]);
    expect(rendered).toHaveBeenCalled();
  });

  it("preserves newer completion intent while canceling source changed during kernel selection", async () => {
    let select;
    const service = execution({
      startKernelFor: () =>
        new Promise((resolve) => {
          select = resolve;
        }),
    });
    const rendered = spyOn(require("../lib/result"), "createResultAsync");
    const receipt = await service.execute({
      editor,
      blocks: [{ code: "a1", row: 0, cellType: "code" }],
    });
    calls.length = 0;
    editor.setText("a1 + newer_typing");
    const readyKernel = {};
    store.kernelMapping.set(store.filePath, new Map([[store.grammar.name, readyKernel]]));
    select(readyKernel);
    expect((await receipt.done).status).toBe("cancelled");
    expect(calls).toEqual([]);
    expect(rendered).not.toHaveBeenCalled();
  });
});
