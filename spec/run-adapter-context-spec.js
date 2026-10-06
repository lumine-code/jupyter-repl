const path = require("node:path");
const { Disposable } = require("lumine");

describe("run commands capture notebook adapter controls", () => {
  let main, store, integration, registration, activeAdapter, kernel, textEditor;
  let clear, run, single, batch;

  function adapter(id) {
    const filePath = `C:/work/run-adapter-${id}.ipynb`;
    const owner = {
      id,
      getPath: () => filePath,
      isDestroyed: () => false,
      onDidDestroy: () => new Disposable(),
      onDidChangePath: () => new Disposable(),
    };
    const paneItem = { getTitle: () => `notebook-${id}`, isDestroyed: () => false };
    return {
      getPaneItem: () => paneItem,
      getKernelOwner: () => owner,
      getPath: () => filePath,
      getKernelLanguage: () => "python",
      getKernelGrammar: () => ({ name: "Python", scopeName: "source.python" }),
      getKernelTarget: () => null,
      getRunTargets: () => [],
    };
  }

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pack.mainModule;
    store = require("../lib/store");
    integration = require("../lib/adapter-integration");
    activeAdapter = adapter("first");
    registration = main.consumeJupyterAdapter({ getActiveAdapter: () => activeAdapter });
    integration.activateAdapterIntegration();
    spyOn(lumine.workspace, "getFocusedTextEditor").and.returnValue(null);
    store.updateEditor(null);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    kernel = {
      restart: jasmine.createSpy("restart notebook kernel").and.callFake(async (callback) => {
        callback?.();
        return true;
      }),
    };
    store.kernelMapping.set(activeAdapter.getPath(), kernel);
    clear = spyOn(integration, "clearAdapterResults").and.callThrough();
    run = spyOn(integration, "runAdapterTargets").and.returnValue(true);
    single = spyOn(require("../lib/result"), "createResult");
    batch = spyOn(require("../lib/result"), "createResultBatch");
  });

  afterEach(async () => {
    registration.dispose();
    await lumine.packages.deactivatePackage("jupyter-repl");
    textEditor?.destroy();
    textEditor = null;
  });

  function dispatch(command) {
    return lumine.commands.dispatch(lumine.views.getView(lumine.workspace), command);
  }

  function pendingRestart() {
    let resume;
    kernel.restart.and.callFake(
      (callback) =>
        new Promise((resolve) => {
          resume = () => {
            callback?.();
            resolve(true);
          };
        }),
    );
    return () => resume();
  }

  it("recalculates using the notebook kernel with no sticky text editor", async () => {
    expect(store.editor).toBeNull();

    await dispatch("jupyter-repl:recalculate-all-inline");

    expect(kernel.restart).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalled();
    expect(run.calls.mostRecent().args[2].scope).toBe("all");
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("clears and restarts the notebook without needing a text editor", async () => {
    await dispatch("jupyter-repl:clear-and-restart");

    expect(kernel.restart).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not run the replacement notebook or fall back to text after an owner switch", async () => {
    textEditor = await lumine.workspace.open();
    textEditor.setText("unrelated_text()");
    store.updateEditor(textEditor);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    const resume = pendingRestart();
    const pending = dispatch("jupyter-repl:recalculate-all-above-inline");
    expect(kernel.restart).toHaveBeenCalledTimes(1);
    activeAdapter = adapter("replacement");
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    resume();
    await pending;

    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not resume notebook runs after the package is deactivated", async () => {
    const resume = pendingRestart();
    const pending = dispatch("jupyter-repl:recalculate-all-inline");
    await lumine.packages.deactivatePackage("jupyter-repl");
    resume();
    await pending;

    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not dispatch into a changed kernel binding on the same notebook", async () => {
    const resume = pendingRestart();
    const pending = dispatch("jupyter-repl:recalculate-all-inline");
    expect(kernel.restart).toHaveBeenCalledTimes(1);
    store.kernelMapping.set(activeAdapter.getPath(), { restart: jasmine.createSpy("replacement") });
    resume();
    await pending;

    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("routes a dispatch from an inactive notebook cell to its own adapter", async () => {
    textEditor = await lumine.workspace.open();
    textEditor.setText("own_notebook()");
    textEditor.isJupyterNotebookSourceEditor = true;
    const inactive = adapter("inactive");
    const target = { id: "own-cell", editor: textEditor };
    inactive.getActiveTargetId = () => target.id;
    inactive.getKernelTarget = () => target;
    inactive.getRunTarget = () => target;
    const ownProvider = main.consumeJupyterAdapter({
      getAdapterForItem: (item) => (item === inactive.getPaneItem() ? inactive : null),
    });
    spyOn(lumine.workspace, "getPaneItems").and.returnValue([
      inactive.getPaneItem(),
      activeAdapter.getPaneItem(),
    ]);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    try {
      await main.run(false, { target: textEditor.element });
      const scoped = run.calls.mostRecent().args[0];
      expect(scoped[0].getActiveAdapter().getKernelOwner()).toBe(inactive.getKernelOwner());
      expect(scoped[0].getActiveAdapter().getActiveTargetId()).toBe(target.id);
      expect(single).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    } finally {
      ownProvider.dispose();
    }
  });
});
