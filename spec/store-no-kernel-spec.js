describe("empty kernel store lookup", () => {
  let store, editor, Kernel;

  beforeEach(async () => {
    // A preceding package lifecycle spec can replace this whole module graph.
    const Store = require("../lib/store").constructor;
    Kernel = require("../lib/kernel");
    store = new Store();
    editor = await lumine.workspace.open();
    store.editor = editor;
    store.activePaneItem = editor;
    store.grammar = editor.getGrammar();
  });

  afterEach(() => {
    store.runningKernels = [];
    store.dispose();
    store.emitter.dispose();
    editor.destroy();
  });

  function knownKernel(grammar = store.grammar) {
    const kernel = Object.create(Kernel.prototype);
    kernel.transport = { grammar, kernelSpec: { display_name: "Test kernel" } };
    return kernel;
  }

  it("does not consult pane, editor path, grammar, or config when there is nothing to resolve", () => {
    const pane = {
      getJupyterKernel: jasmine
        .createSpy("unused pane kernel")
        .and.throwError("Unexpected pane lookup"),
    };
    store.activePaneItem = pane;
    store.globalMode = true;
    store.grammar = {
      get name() {
        throw new Error("Unexpected grammar lookup");
      },
    };
    const path = spyOn(editor, "getPath").and.throwError("Unexpected editor path lookup");
    const config = spyOn(lumine.config, "get").and.callThrough();
    const grammar = spyOn(store, "getEmbeddedGrammar").and.throwError(
      "Unexpected embedded grammar lookup",
    );

    expect(store.kernel).toBeNull();
    expect(pane.getJupyterKernel).not.toHaveBeenCalled();
    expect(path).not.toHaveBeenCalled();
    expect(config).not.toHaveBeenCalled();
    expect(grammar).not.toHaveBeenCalled();
  });

  it("preserves a provisional notebook binding before its kernel joins the running set", () => {
    const kernel = knownKernel();
    const path = "/work/provisional.ipynb";
    store.activePaneItem = { getPath: () => path };
    const registration = store.prepareNotebookKernel(kernel, path);

    expect(store.runningKernels.length).toBe(0);
    expect(store.kernel).toBe(kernel);
    expect(store.rollbackNotebookKernel(registration)).toBe(true);
    expect(store.kernel).toBeNull();
  });

  it("preserves a running global kernel that has no file mapping yet", () => {
    const grammar = { name: "Python", scopeName: "source.python" };
    const kernel = knownKernel(grammar);
    store.globalMode = true;
    store.grammar = grammar;
    store.runningKernels.push(kernel);

    expect(store.kernelMapping.size).toBe(0);
    expect(store.kernel).toBe(kernel);
  });

  it("announces start, path remapping, and stop through the current data", () => {
    const firstPath = "/work/first.py";
    const secondPath = "/work/renamed.py";
    let currentPath = firstPath;
    spyOn(editor, "getPath").and.callFake(() => currentPath);
    const kernel = knownKernel();
    const seen = [];
    store.onDidChangeCurrentKernel((current) => seen.push(current));
    expect(store.kernel).toBeNull();
    store.runningKernels.push(kernel);
    store.kernelMapping.set(firstPath, kernel);
    store._emitKernelsChanged();
    expect(store.kernel).toBe(kernel);
    currentPath = secondPath;
    store._notifyKernelChanged();
    expect(store.kernel).toBeNull();
    store.remapKernelKey(firstPath, secondPath);
    expect(store.kernel).toBe(kernel);
    store.deleteKernel(kernel);
    expect(store.kernel).toBeNull();
    expect(store.kernelMapping.size).toBe(0);
    expect(store.runningKernels.length).toBe(0);
    expect(seen).toEqual([kernel, null, kernel, null]);
  });

  it("does not parse huge or malformed global mappings or produce repeated notifications", () => {
    const originalGet = lumine.config.get.bind(lumine.config);
    let mappings;
    const config = spyOn(lumine.config, "get").and.callFake((key, ...args) =>
      key === "jupyter-repl.languageMappings" ? mappings : originalGet(key, ...args),
    );
    const notifications = spyOn(lumine.notifications, "addError");
    store.globalMode = true;
    store.grammar = { name: "Python", scopeName: "source.python" };
    for (const value of [
      JSON.stringify(
        Object.fromEntries(
          Array.from({ length: 10000 }, (_, index) => [`language-${index}`, `grammar-${index}`]),
        ),
      ),
      "{",
    ]) {
      mappings = value;
      for (let index = 0; index < 100; index++) expect(store.kernel).toBeNull();
    }
    expect(config).not.toHaveBeenCalled();
    expect(notifications).not.toHaveBeenCalled();
  });
});
