const { peekKernel, snapshot } = require("../lib/kernel-availability");
const { Emitter } = require("lumine");

describe("passive kernel availability", () => {
  it("does not resolve any runtime ports when the store is cold", () => {
    const adapterKernel = jasmine.createSpy("adapter cache");
    const windowContext = jasmine.createSpy("window cache");
    expect(peekKernel({ store: null, adapterKernel, windowContext }, { item: {} })).toBeNull();
    expect(adapterKernel).not.toHaveBeenCalled();
    expect(windowContext).not.toHaveBeenCalled();
  });

  it("uses the saved item instead of another window's current item without reading text or wrappers", () => {
    const first = { id: "main", transport: {}, language: "python", executionState: "idle" };
    const second = {
      id: "saved",
      transport: { ownsKernelProcess: false },
      language: "python",
      executionState: "busy",
      getPluginWrapper: jasmine.createSpy("wrapper"),
    };
    const item = {};
    const store = { runningKernels: [first, second], kernelMapping: new Map() };
    const state = snapshot(
      peekKernel(
        {
          store,
          adapterKernel: (target) => (target === item ? second : null),
          windowContext: () => ({
            container: { getActivePaneItem: () => ({}) },
            lastKernel: first,
          }),
        },
        { item, window: {} },
      ),
    );
    expect(state.id).toBe("saved");
    expect(state.capabilities.disconnect).toBe(true);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.capabilities)).toBe(true);
    expect(second.getPluginWrapper).not.toHaveBeenCalled();
  });

  it("does not parse source to resolve an editor's known binding", () => {
    const kernel = { id: "known", transport: {} };
    const editor = {
      id: 1,
      getPath: () => "/project/file.py",
      getText: jasmine.createSpy("source").and.throwError("Unexpected parse"),
    };
    expect(
      peekKernel(
        {
          store: { runningKernels: [kernel], kernelMapping: new Map([[editor.getPath(), kernel]]) },
          adapterKernel: () => null,
          windowContext: () => null,
        },
        { editor },
      ),
    ).toBe(kernel);
    expect(editor.getText).not.toHaveBeenCalled();
  });

  it("uses cached mappings for a global-mode dialect without parsing configuration", () => {
    const kernel = { grammar: { name: "Python" } };
    const editor = { getGrammar: () => ({ name: "IPython" }) };
    spyOn(JSON, "parse").and.throwError("Availability must not parse configuration");
    expect(
      peekKernel(
        {
          store: { globalMode: true, runningKernels: [kernel], kernelMapping: new Map() },
          adapterKernel: () => null,
          windowContext: () => null,
        },
        { editor },
      ),
    ).toBe(kernel);
  });
});

describe("kernel availability service notifications", () => {
  let main, service, store, events, editor;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    main = (await lumine.packages.activatePackage("jupyter-repl")).mainModule;
    service = main.provideJupyterKernel();
    service.getRunningKernels();
    store = require("../lib/store");
    events = new Emitter();
    editor = await lumine.workspace.open();
  });
  afterEach(async () => {
    store.runningKernels = [];
    events.dispose();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  it("publishes cached state changes and stops observing a removed kernel", () => {
    const kernel = {
      id: "test",
      grammar: editor.getGrammar(),
      language: "python",
      executionState: "idle",
      transport: {},
      onDidChangeStatus: (callback) => events.on("status", callback),
      getPluginWrapper: jasmine.createSpy("wrapper").and.returnValue({}),
    };
    Object.setPrototypeOf(kernel, require("../lib/kernel").prototype);
    spyOnProperty(store, "kernel", "get").and.returnValue(null);
    store.kernelMapping.set(`Unsaved Editor ${editor.id}`, kernel);
    const changed = jasmine.createSpy("state changed");
    const lease = service.onDidChangeKernelState(changed);
    expect(changed).not.toHaveBeenCalled();
    store.runningKernels = [kernel];
    store._emitKernelsChanged();
    kernel.getPluginWrapper.calls.reset();
    expect(service.peekKernelState({ editor }).executionState).toBe("idle");
    expect(changed).toHaveBeenCalled();
    changed.calls.reset();
    kernel.executionState = "busy";
    events.emit("status");
    expect(changed).toHaveBeenCalledTimes(1);
    expect(service.peekKernelState({ editor }).executionState).toBe("busy");
    expect(kernel.getPluginWrapper).not.toHaveBeenCalled();
    store.runningKernels = [];
    store._emitKernelsChanged();
    changed.calls.reset();
    events.emit("status");
    expect(changed).not.toHaveBeenCalled();
    expect(service.peekKernelState({ editor })).toBeNull();
    lease.dispose();
  });
});
