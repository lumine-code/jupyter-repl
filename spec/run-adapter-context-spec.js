const path = require("node:path");
const { Disposable } = require("lumine");

describe("run commands capture notebook adapter controls", () => {
  let main, store, integration, registration, activeAdapter, kernel, textEditor;
  let clear, run, single, batch, knownAdapters;

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
    const instance = {
      getTitle: () => `notebook-${id}`,
      getActiveTargetId: () => null,
      getRunTarget: () => null,
      getPaneItem: () => paneItem,
      getKernelOwner: () => owner,
      getPath: () => filePath,
      getKernelLanguage: () => "python",
      getKernelGrammar: () => ({ name: "Python", scopeName: "source.python" }),
      getKernelTarget: () => null,
      getRunTargets: () => [],
    };
    knownAdapters.add(instance);
    return instance;
  }

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pack.mainModule;
    store = require("../lib/store");
    integration = require("../lib/adapter-integration");
    knownAdapters = new Set();
    activeAdapter = adapter("first");
    registration = main.consumeJupyterAdapter({
      getActiveAdapter: () => activeAdapter,
      getAdapterForItem: (item) =>
        [...knownAdapters].find((candidate) => candidate.getPaneItem() === item) || null,
    });
    integration.activateAdapterIntegration();
    spyOn(lumine.workspace, "getFocusedTextEditor").and.returnValue(null);
    store.updateEditor(null);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    kernel = {
      restart: jasmine.createSpy("restart notebook kernel").and.resolveTo(true),
    };
    store.kernelMapping.set(activeAdapter.getPath(), kernel);
    clear = spyOn(integration, "clearAdapterResults").and.callThrough();
    run = spyOn(integration, "runAdapterTargets").and.callFake((_services, _manager, request) => {
      request.onComplete({ status: "ok" });
      return true;
    });
    single = spyOn(require("../lib/result"), "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: null,
    });
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
      () =>
        new Promise((resolve) => {
          resume = () => {
            resolve(true);
          };
        }),
    );
    return () => resume();
  }

  it("recalculates using the notebook kernel with no sticky text editor", async () => {
    expect(store.editor).toBeNull();

    const [receipt] = await dispatch("jupyter-repl:recalculate-all-inline");
    expect((await receipt.done).status).toBe("ok");

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

  it("runs the captured notebook after focus changes without falling back to text", async () => {
    textEditor = await lumine.workspace.open();
    textEditor.setText("unrelated_text()");
    store.updateEditor(textEditor);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    const resume = pendingRestart();
    const invoked = activeAdapter;
    const [receipt] = await dispatch("jupyter-repl:recalculate-all-above-inline");
    expect(kernel.restart).toHaveBeenCalledTimes(1);
    activeAdapter = adapter("replacement");
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    resume();
    expect((await receipt.done).status).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.calls.mostRecent().args[2].adapter.getKernelOwner()).toBe(invoked.getKernelOwner());
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not resume notebook runs after the package is deactivated", async () => {
    const resume = pendingRestart();
    const [receipt] = await dispatch("jupyter-repl:recalculate-all-inline");
    await lumine.packages.deactivatePackage("jupyter-repl");
    resume();
    expect((await receipt.done).status).toBe("unavailable");

    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("does not dispatch into a changed kernel binding on the same notebook", async () => {
    const resume = pendingRestart();
    const [receipt] = await dispatch("jupyter-repl:recalculate-all-inline");
    expect(kernel.restart).toHaveBeenCalledTimes(1);
    store.kernelMapping.set(activeAdapter.getPath(), { restart: jasmine.createSpy("replacement") });
    resume();
    expect((await receipt.done).status).toBe("cancelled");

    expect(run).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
  });

  it("routes a dispatch from an inactive notebook cell to its own adapter", async () => {
    textEditor = await lumine.workspace.open();
    textEditor.setText("own_notebook()");
    textEditor.isJupyterNotebookSourceEditor = true;
    const inactive = adapter("inactive");
    const target = {
      id: "own-cell",
      editor: textEditor,
      type: "code",
      executable: true,
      source: textEditor.getText(),
      row: 0,
      grammar: textEditor.getGrammar(),
    };
    inactive.getActiveTargetId = () => target.id;
    inactive.getKernelTarget = () => target;
    inactive.getRunTarget = () => target;
    inactive.getRunTargets = () => [target];
    const ownProvider = main.consumeJupyterAdapter({
      getAdapterForItem: (item) => (item === inactive.getPaneItem() ? inactive : null),
    });
    spyOn(lumine.workspace, "getPaneItems").and.returnValue([
      inactive.getPaneItem(),
      activeAdapter.getPaneItem(),
    ]);
    store.updateActivePaneItem(activeAdapter.getPaneItem());
    try {
      const receipt = await main.run(false, { target: textEditor.element });
      expect((await receipt.done).status).toBe("ok");
      const invoked = run.calls.mostRecent().args[2].adapter;
      expect(invoked.getKernelOwner()).toBe(inactive.getKernelOwner());
      expect(invoked.getActiveTargetId()).toBe(target.id);
      expect(single).not.toHaveBeenCalled();
      expect(batch).not.toHaveBeenCalled();
    } finally {
      ownProvider.dispose();
    }
  });
});
