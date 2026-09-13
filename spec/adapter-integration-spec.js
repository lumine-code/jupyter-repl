const { Disposable, Emitter } = require("lumine");
const adapterIntegration = require("../lib/adapter-integration");
const result = require("../lib/result");
const store = require("../lib/store");

describe("notebook adapter kernel integration", () => {
  const pythonGrammar = { name: "Python", scopeName: "source.python" };
  const rGrammar = { name: "R", scopeName: "source.r" };
  let owners;
  let previousEditor;

  function makeEditor(id, grammar = pythonGrammar) {
    return {
      id,
      element: null,
      getPath: () => null,
      getGrammar: () => grammar,
      getLastBufferRow: () => 0,
      isDestroyed: () => false,
      onDidDestroy: () => new Disposable(),
    };
  }

  function makeAdapter({
    path = "C:\\work\\notebook.ipynb",
    metadata = {
      kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
      language_info: { name: "python" },
    },
    targets = [],
    grammarForSpec = (spec) => (spec?.language === "R" ? rGrammar : pythonGrammar),
  } = {}) {
    const emitter = new Emitter();
    const owner = {
      id: `document-${owners.length}`,
      filePath: path,
      metadata: JSON.parse(JSON.stringify(metadata)),
      isDestroyed: () => owner.destroyed === true,
      getPath: () => owner.filePath,
      onDidChangePath: (callback) => emitter.on("did-change-path", callback),
      onDidDestroy: (callback) => emitter.on("did-destroy", callback),
      setPath(nextPath) {
        owner.filePath = nextPath;
        emitter.emit("did-change-path", nextPath);
      },
      destroy() {
        owner.destroyed = true;
        emitter.emit("did-destroy");
        emitter.dispose();
      },
      updateMetadata(nextMetadata) {
        owner.metadata = JSON.parse(JSON.stringify(nextMetadata));
      },
    };
    owners.push(owner);
    const paneItem = {
      getTitle: () => "notebook.ipynb",
      destroyed: false,
      isDestroyed: () => paneItem.destroyed,
    };
    const adapter = {
      getPaneItem: () => paneItem,
      getKernelOwner: () => owner,
      getPath: () => owner.filePath,
      getTitle: () => "notebook.ipynb",
      getMetadata: () => owner.metadata,
      getKernelLanguage(kernelSpec = null) {
        const language =
          kernelSpec?.language ||
          owner.metadata.kernelspec?.language ||
          owner.metadata.language_info?.name ||
          "python";
        return String(language).toLowerCase() === "c++" ? "cpp" : String(language).toLowerCase();
      },
      getKernelGrammar: grammarForSpec,
      getActiveTargetId: () => targets[0]?.id ?? 0,
      getKernelTarget: () => targets[0] || null,
      getRunTarget: (id) => targets.find((target) => target.id === id) || null,
      getRunTargets: () => targets,
      setKernelSpec(kernelSpec, languageInfo) {
        const language = languageInfo?.name || kernelSpec.language;
        owner.metadata = {
          ...owner.metadata,
          kernelspec: {
            name: kernelSpec.name,
            display_name: kernelSpec.display_name,
            language,
          },
          language_info: { ...(languageInfo || {}), name: language },
        };
      },
    };
    return { adapter, owner, paneItem };
  }

  function serviceFor(adapter) {
    return { getActiveAdapter: () => adapter };
  }

  function fakeKernel(kernelSpec, languageInfo = null) {
    return {
      kernelSpec,
      language: languageInfo?.name || kernelSpec.language,
      languageInfo,
      grammar: pythonGrammar,
      transport: { grammar: pythonGrammar },
      executionState: "idle",
      shutdownAndDestroy: jasmine.createSpy("shutdownAndDestroy"),
    };
  }

  async function flushPromises() {
    for (let index = 0; index < 10; index++) await Promise.resolve();
  }

  beforeEach(() => {
    adapterIntegration.activateAdapterIntegration();
    previousEditor = store.editor;
    owners = [];
    store.kernelMapping.clear();
    store.runningKernels = [];
    store.setExternalKernel(null);
  });

  afterEach(() => {
    adapterIntegration.disposeAdapterIntegration();
    for (const owner of owners) {
      if (!owner.destroyed) owner.destroy();
    }
    store.kernelMapping.clear();
    store.runningKernels = [];
    store.setExternalKernel(null);
    store.updateEditor(previousEditor?.isDestroyed?.() ? null : previousEditor);
  });

  it("uses the notebook kernelspec instead of a cell syntax grammar", async () => {
    const editor = makeEditor(1, pythonGrammar);
    const target = { id: 0, type: "code", executable: true, editor, grammar: pythonGrammar };
    const { adapter } = makeAdapter({
      metadata: {
        kernelspec: { name: "ir", display_name: "R", language: "R" },
        language_info: { name: "python" },
      },
      targets: [target],
    });
    const specs = [
      { name: "python3", display_name: "Python 3", language: "python" },
      { name: "ir", display_name: "R", language: "R" },
    ];
    const manager = {
      getAllKernelSpecs: jasmine.createSpy("getAllKernelSpecs").and.resolveTo(specs),
      startKernel: jasmine.createSpy("startKernel"),
    };

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();

    expect(manager.startKernel).toHaveBeenCalled();
    const args = manager.startKernel.calls.mostRecent().args;
    expect(args[0]).toBe(specs[1]);
    expect(args[1]).toBe(rGrammar);
    expect(args[1]).not.toBe(target.grammar);
    expect(args[5]).toEqual(
      jasmine.objectContaining({
        bindingOwner: adapter.getKernelOwner(),
        deferRegistration: true,
        startKey: adapter.getKernelOwner(),
      }),
    );
  });

  it("allows a kernel whose language has no installed Lumine grammar", async () => {
    const editor = makeEditor(2);
    const target = { id: 0, type: "code", executable: true, editor, grammar: pythonGrammar };
    const { adapter } = makeAdapter({
      metadata: { kernelspec: { name: "julia", language: "julia" } },
      targets: [target],
      grammarForSpec: () => null,
    });
    const spec = { name: "julia", display_name: "Julia", language: "julia" };
    const manager = {
      getAllKernelSpecs: jasmine.createSpy("getAllKernelSpecs").and.resolveTo([spec]),
      startKernel: jasmine.createSpy("startKernel"),
    };
    spyOn(lumine.notifications, "addError");

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();

    expect(manager.startKernel).toHaveBeenCalled();
    expect(manager.startKernel.calls.mostRecent().args[1].scopeName).toContain("text.plain");
    expect(lumine.notifications.addError).not.toHaveBeenCalled();
  });

  it("loads the notebook's local picker from the unfiltered kernelspec list", async () => {
    const editor = makeEditor(20);
    const { adapter } = makeAdapter({
      targets: [{ id: 0, type: "code", executable: true, editor, grammar: pythonGrammar }],
    });
    const specs = [
      { name: "python3", display_name: "Python 3", language: "python" },
      { name: "ir", display_name: "R", language: "R" },
    ];
    const manager = {
      getAllKernelSpecs: jasmine.createSpy("getAllKernelSpecs").and.resolveTo(specs),
      updateKernelSpecs: jasmine.createSpy("updateKernelSpecs").and.resolveTo(specs),
      startKernel: jasmine.createSpy("startKernel"),
    };

    expect(adapterIntegration.startAdapterKernel(serviceFor(adapter), manager)).toBe(true);
    await flushPromises();

    expect(manager.getAllKernelSpecs).toHaveBeenCalled();
    expect(manager.startKernel).not.toHaveBeenCalled();
  });

  it("leaves metadata and the binding untouched when kernel selection is cancelled", async () => {
    const editor = makeEditor(21);
    const { adapter, owner } = makeAdapter({
      metadata: { language_info: { name: "python" } },
      targets: [{ id: 0, type: "code", executable: true, editor, grammar: pythonGrammar }],
    });
    const originalMetadata = JSON.parse(JSON.stringify(owner.metadata));
    const manager = {
      getAllKernelSpecs: jasmine.createSpy("getAllKernelSpecs").and.resolveTo([
        { name: "python3", display_name: "Python 3", language: "python" },
        { name: "ir", display_name: "R", language: "R" },
      ]),
      updateKernelSpecs: jasmine.createSpy("updateKernelSpecs"),
      startKernel: jasmine.createSpy("startKernel"),
    };

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();
    adapterIntegration.disposeAdapterIntegration();
    await flushPromises();

    expect(manager.startKernel).not.toHaveBeenCalled();
    expect(owner.metadata).toEqual(originalMetadata);
    expect(store.kernelMapping.has(adapter.getPath())).toBe(false);
  });

  it("leaves metadata untouched when startup fails", async () => {
    const editor = makeEditor(22);
    const { adapter, owner } = makeAdapter({
      targets: [{ id: 0, type: "code", executable: true, editor, grammar: pythonGrammar }],
    });
    const originalMetadata = JSON.parse(JSON.stringify(owner.metadata));
    const manager = {
      getAllKernelSpecs: jasmine
        .createSpy("getAllKernelSpecs")
        .and.resolveTo([{ name: "python3", display_name: "Python 3", language: "python" }]),
      startKernel: jasmine.createSpy("startKernel").and.throwError("launch failed"),
    };
    spyOn(lumine.notifications, "addError");

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();

    expect(owner.metadata).toEqual(originalMetadata);
    expect(store.kernelMapping.has(adapter.getPath())).toBe(false);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("runs every code target in the one kernel bound to the notebook", async () => {
    const editors = [makeEditor(3, pythonGrammar), makeEditor(4, rGrammar)];
    const targets = [
      {
        id: 0,
        type: "code",
        executable: true,
        source: "one",
        editor: editors[0],
        grammar: pythonGrammar,
      },
      { id: 1, type: "markdown", executable: false, source: "# title", editor: editors[0] },
      {
        id: 2,
        type: "code",
        executable: true,
        source: "two",
        editor: editors[1],
        grammar: rGrammar,
      },
    ];
    const { adapter } = makeAdapter({ targets });
    const kernel = fakeKernel({ name: "python3", display_name: "Python 3", language: "python" });
    store.kernelMapping.set(adapter.getPath(), kernel);
    const executions = [];
    spyOn(result, "createResultAsync").and.callFake((context) => {
      executions.push(context.kernel);
      return Promise.resolve({ success: true, durationMs: 1 });
    });

    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "all" });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(executions).toEqual([kernel, kernel]);
  });

  it("detaches a binding that source metadata changed to another language", async () => {
    const editor = makeEditor(23);
    const target = { id: 0, type: "code", executable: true, editor, grammar: pythonGrammar };
    const { adapter, owner } = makeAdapter({
      metadata: {
        kernelspec: { name: "ir", display_name: "R", language: "R" },
        language_info: { name: "R" },
      },
      targets: [target],
    });
    const oldKernel = fakeKernel(owner.metadata.kernelspec);
    store.kernelMapping.set(adapter.getPath(), oldKernel);
    owner.metadata = {
      kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
      language_info: { name: "python" },
    };
    const manager = {
      getAllKernelSpecs: jasmine
        .createSpy("getAllKernelSpecs")
        .and.resolveTo([{ name: "python3", display_name: "Python 3", language: "python" }]),
      startKernel: jasmine.createSpy("startKernel"),
    };

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();

    expect(store.kernelMapping.has(adapter.getPath())).toBe(false);
    expect(manager.startKernel).toHaveBeenCalled();
    expect(oldKernel.shutdownAndDestroy).toHaveBeenCalled();
  });

  it("keeps a binding when metadata and the running kernel use C++ aliases", async () => {
    const editor = makeEditor(24);
    const target = {
      id: 0,
      type: "code",
      executable: true,
      source: "1 + 1",
      editor,
      grammar: { name: "C++", scopeName: "source.cpp" },
    };
    const { adapter } = makeAdapter({
      metadata: {
        kernelspec: { name: "xcpp", display_name: "C++", language: "cpp" },
        language_info: { name: "cpp" },
      },
      targets: [target],
    });
    const kernel = fakeKernel({ name: "xcpp", display_name: "C++", language: "c++" });
    store.kernelMapping.set(adapter.getPath(), kernel);
    spyOn(result, "createResultAsync").and.resolveTo({ success: true, durationMs: 1 });

    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "active" });
    await flushPromises();

    expect(store.kernelMapping.get(adapter.getPath())).toBe(kernel);
    expect(result.createResultAsync).toHaveBeenCalled();
  });

  it("keeps one binding across splits and remaps it on Save As", () => {
    const first = makeAdapter();
    const second = makeAdapter();
    second.adapter.getKernelOwner = () => first.owner;
    second.adapter.getPath = () => first.owner.filePath;
    const firstContext = adapterIntegration.captureAdapterKernelContext(serviceFor(first.adapter));
    const secondContext = adapterIntegration.captureAdapterKernelContext(
      serviceFor(second.adapter),
    );
    const kernel = fakeKernel({ name: "python3", display_name: "Python 3", language: "python" });
    store.kernelMapping.set(firstContext.filePath, kernel);

    expect(secondContext.filePath).toBe(firstContext.filePath);
    first.owner.setPath("C:\\work\\renamed.ipynb");

    expect(store.kernelMapping.has(firstContext.filePath)).toBe(false);
    expect(store.kernelMapping.get("C:\\work\\renamed.ipynb")).toBe(kernel);
    second.owner.destroy();
  });

  it("refreshes a pending bind onto a surviving split of the same document", async () => {
    const staleEditor = makeEditor(25);
    const liveEditor = makeEditor(26);
    const first = makeAdapter({
      targets: [{ id: "shared-cell", type: "code", executable: true, editor: staleEditor }],
    });
    const second = makeAdapter({
      targets: [{ id: "shared-cell", type: "code", executable: true, editor: liveEditor }],
    });
    second.adapter.getKernelOwner = () => first.owner;
    second.adapter.getPath = () => first.owner.filePath;
    second.adapter.getMetadata = () => first.owner.metadata;
    second.adapter.setKernelSpec = jasmine.createSpy("setKernelSpec").and.callFake((kernelSpec) => {
      first.owner.metadata = {
        ...first.owner.metadata,
        kernelspec: { ...kernelSpec },
        language_info: { name: kernelSpec.language },
      };
      return true;
    });
    const service = {
      getActiveAdapter: () => first.adapter,
      getAdapterForItem: (item) => {
        if (item === first.paneItem) return first.adapter;
        if (item === second.paneItem) return second.adapter;
        return null;
      },
    };
    const context = adapterIntegration.captureAdapterKernelContext(service);
    first.paneItem.destroyed = true;
    spyOn(lumine.workspace, "getPaneItems").and.returnValue([second.paneItem]);
    const kernel = fakeKernel({ name: "ir", display_name: "R", language: "R" });

    await expectAsync(
      adapterIntegration.bindAdapterKernel(context, kernel, { owned: true }),
    ).toBeResolvedTo(true);

    expect(second.adapter.setKernelSpec).toHaveBeenCalled();
    expect(store.kernelMapping.get(first.owner.filePath)).toBe(kernel);
    second.owner.destroy();
  });

  it("drops the document binding only when its shared owner is destroyed", () => {
    const { adapter, owner } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const kernel = fakeKernel({ name: "python3", language: "python" });
    store.kernelMapping.set(context.filePath, kernel);

    owner.destroy();

    expect(store.kernelMapping.has(context.filePath)).toBe(false);
    expect(kernel.shutdownAndDestroy).toHaveBeenCalled();
  });

  it("does not touch metadata when kernel registration fails", async () => {
    const previousMetadata = {
      kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
      language_info: { name: "python", version: "3.13" },
      custom: { keep: true },
    };
    const { adapter, owner } = makeAdapter({ metadata: previousMetadata });
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const previousKernel = fakeKernel(previousMetadata.kernelspec);
    const nextKernel = fakeKernel(
      { name: "ir", display_name: "R", language: "R" },
      { name: "R", version: "4.5" },
    );
    store.kernelMapping.set(context.filePath, previousKernel);
    spyOn(store, "prepareNotebookKernel").and.throwError("registration failed");
    spyOn(adapter, "setKernelSpec").and.callThrough();
    spyOn(lumine.notifications, "addError");

    await expectAsync(adapterIntegration.bindAdapterKernel(context, nextKernel)).toBeResolvedTo(
      false,
    );

    expect(owner.metadata).toEqual(previousMetadata);
    expect(store.kernelMapping.get(context.filePath)).toBe(previousKernel);
    expect(adapter.setKernelSpec).not.toHaveBeenCalled();
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("rolls the binding and running-kernel registration back when metadata fails", async () => {
    const { adapter } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const previousKernel = fakeKernel(adapter.getMetadata().kernelspec);
    const nextKernel = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    store.kernelMapping.set(context.filePath, previousKernel);
    spyOn(adapter, "setKernelSpec").and.throwError("metadata failed");
    spyOn(lumine.notifications, "addError");

    await expectAsync(adapterIntegration.bindAdapterKernel(context, nextKernel)).toBeResolvedTo(
      false,
    );

    expect(store.kernelMapping.get(context.filePath)).toBe(previousKernel);
    expect(store.runningKernels).not.toContain(nextKernel);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("uses kernel_info language for the final grammar and persisted metadata", async () => {
    const { adapter, owner } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const kernel = fakeKernel(
      { name: "surprising", display_name: "Surprising", language: "python" },
      { name: "R", version: "4.5" },
    );

    await expectAsync(
      adapterIntegration.bindAdapterKernel(context, kernel, { owned: true }),
    ).toBeResolvedTo(true);

    expect(kernel.transport.grammar).toBe(rGrammar);
    expect(owner.metadata.kernelspec.language).toBe("R");
    expect(owner.metadata.language_info).toEqual({ name: "R", version: "4.5" });
  });

  it("does not rewrite the grammar identity of an already-running shared kernel", async () => {
    const { adapter } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const kernel = fakeKernel({ name: "python3", display_name: "Python 3", language: "python" });
    const originalGrammar = { name: "Python", scopeName: "source.python" };
    kernel.transport.grammar = originalGrammar;
    store.runningKernels.push(kernel);

    await expectAsync(adapterIntegration.bindAdapterKernel(context, kernel)).toBeResolvedTo(true);

    expect(kernel.transport.grammar).toBe(originalGrammar);
  });

  it("refuses to replace a busy notebook kernel", async () => {
    const { adapter, owner } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const previousMetadata = JSON.parse(JSON.stringify(owner.metadata));
    const running = fakeKernel(owner.metadata.kernelspec);
    running.executionState = "busy";
    store.kernelMapping.set(context.filePath, running);
    spyOn(lumine.notifications, "addWarning");

    const replacement = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    await expectAsync(adapterIntegration.bindAdapterKernel(context, replacement)).toBeResolvedTo(
      false,
    );

    expect(store.kernelMapping.get(context.filePath)).toBe(running);
    expect(owner.metadata).toEqual(previousMetadata);
    expect(lumine.notifications.addWarning).toHaveBeenCalled();
  });

  it("keeps a remote session it only attached to when a binding fails", async () => {
    const { adapter } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const kernel = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    kernel.transport.ownsKernelProcess = false;
    kernel.destroy = jasmine.createSpy("destroy");
    spyOn(adapter, "setKernelSpec").and.throwError("metadata failed");
    spyOn(lumine.notifications, "addError");

    await expectAsync(
      adapterIntegration.bindAdapterKernel(context, kernel, { owned: true }),
    ).toBeResolvedTo(false);

    expect(kernel.destroy).toHaveBeenCalled();
    expect(kernel.shutdownAndDestroy).not.toHaveBeenCalled();
  });

  it("keeps every parallel execution record for the same cell until each run finishes", async () => {
    const editor = makeEditor(40);
    const target = {
      id: "stable-cell-id",
      type: "code",
      executable: true,
      source: "1 + 1",
      editor,
      grammar: pythonGrammar,
    };
    const { adapter } = makeAdapter({ targets: [target] });
    const kernel = fakeKernel(adapter.getMetadata().kernelspec);
    store.kernelMapping.set(adapter.getPath(), kernel);
    const resolvers = [];
    spyOn(result, "createResultAsync").and.callFake(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );

    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "active" });
    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "active" });
    await flushPromises();
    expect(resolvers.length).toBe(2);

    resolvers[0]({ success: true, durationMs: 1 });
    await flushPromises();
    const replacement = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    spyOn(lumine.notifications, "addWarning");
    await expectAsync(
      adapterIntegration.bindAdapterKernel(
        adapterIntegration.captureAdapterKernelContext(serviceFor(adapter)),
        replacement,
      ),
    ).toBeResolvedTo(false);
    expect(store.kernelMapping.get(adapter.getPath())).toBe(kernel);
    expect(lumine.notifications.addWarning).toHaveBeenCalled();

    resolvers[1]({ success: true, durationMs: 1 });
    await flushPromises();
  });

  it("serializes kernel metadata commits for one notebook owner", async () => {
    const { adapter, owner } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const first = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    const second = fakeKernel({ name: "julia", display_name: "Julia", language: "julia" });
    let reentrantBinding = null;
    spyOn(adapter, "setKernelSpec").and.callFake((kernelSpec) => {
      reentrantBinding = adapterIntegration.bindAdapterKernel(context, second, { owned: true });
      owner.metadata = {
        ...owner.metadata,
        kernelspec: { ...kernelSpec },
        language_info: { name: kernelSpec.language },
      };
      return true;
    });
    spyOn(lumine.notifications, "addWarning");

    await expectAsync(
      adapterIntegration.bindAdapterKernel(context, first, { owned: true }),
    ).toBeResolvedTo(true);
    await expectAsync(reentrantBinding).toBeResolvedTo(false);

    expect(store.kernelMapping.get(context.filePath)).toBe(first);
    expect(owner.metadata.kernelspec.name).toBe("ir");
    expect(second.shutdownAndDestroy).toHaveBeenCalled();
    expect(lumine.notifications.addWarning).toHaveBeenCalled();
  });

  it("commits a pending kernel binding at the notebook's Save As path", async () => {
    const { adapter, owner } = makeAdapter();
    const context = adapterIntegration.captureAdapterKernelContext(serviceFor(adapter));
    const savedPath = "C:\\work\\renamed-while-binding.ipynb";
    spyOn(adapter, "setKernelSpec").and.callFake(() => {
      owner.setPath(savedPath);
      return true;
    });
    const kernel = fakeKernel({ name: "ir", display_name: "R", language: "R" });
    const binding = adapterIntegration.bindAdapterKernel(context, kernel, { owned: true });

    await expectAsync(binding).toBeResolvedTo(true);
    expect(store.kernelMapping.has(context.filePath)).toBe(false);
    expect(store.kernelMapping.get(savedPath)).toBe(kernel);
  });

  it("releases a local kernel that finishes starting after integration teardown", async () => {
    const editor = makeEditor(41);
    const { adapter } = makeAdapter({
      targets: [{ id: "cell", type: "code", executable: true, source: "1", editor }],
    });
    let onStarted;
    const manager = {
      getAllKernelSpecs: jasmine
        .createSpy("getAllKernelSpecs")
        .and.resolveTo([adapter.getMetadata().kernelspec]),
      startKernel: jasmine.createSpy("startKernel").and.callFake((...args) => {
        onStarted = args[4];
      }),
    };

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();
    expect(onStarted).toEqual(jasmine.any(Function));
    adapterIntegration.disposeAdapterIntegration();
    const lateKernel = fakeKernel(adapter.getMetadata().kernelspec);

    await onStarted(lateKernel);

    expect(lateKernel.shutdownAndDestroy).toHaveBeenCalled();
    expect(store.kernelMapping.has(adapter.getPath())).toBe(false);
  });

  it("moves focus after the last rehydrated target", async () => {
    const editors = [makeEditor(42), makeEditor(43)];
    const targets = editors.map((editor, index) => ({
      id: `cell-${index}`,
      type: "code",
      executable: true,
      source: String(index),
      editor,
    }));
    const { adapter } = makeAdapter({ targets });
    const nextTarget = { id: "cell-after" };
    adapter.getNextRunTarget = jasmine.createSpy("getNextRunTarget").and.returnValue(nextTarget);
    adapter.focusTarget = jasmine.createSpy("focusTarget");
    const kernel = fakeKernel(adapter.getMetadata().kernelspec);
    store.kernelMapping.set(adapter.getPath(), kernel);
    spyOn(result, "createResultAsync").and.resolveTo({ success: true, durationMs: 1 });

    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "all", moveDown: true });
    await flushPromises();

    expect(adapter.getNextRunTarget.calls.mostRecent().args[0].id).toBe("cell-1");
    expect(adapter.focusTarget).toHaveBeenCalledWith(nextTarget);
  });

  it("does not execute or write back to a cell deleted while its kernel starts", async () => {
    const editor = makeEditor(44);
    const targets = [
      { id: "deleted-cell", type: "code", executable: true, source: "danger()", editor },
    ];
    const { adapter } = makeAdapter({ targets });
    let onStarted;
    const manager = {
      getAllKernelSpecs: jasmine
        .createSpy("getAllKernelSpecs")
        .and.resolveTo([adapter.getMetadata().kernelspec]),
      startKernel: jasmine.createSpy("startKernel").and.callFake((...args) => {
        onStarted = args[4];
      }),
    };
    adapter.finishTargetExecution = jasmine.createSpy("finishTargetExecution");
    spyOn(result, "createResultAsync");

    adapterIntegration.runAdapterTargets(serviceFor(adapter), manager, { scope: "active" });
    await flushPromises();
    targets.splice(0, 1);
    await onStarted(fakeKernel(adapter.getMetadata().kernelspec));
    await flushPromises();

    expect(result.createResultAsync).not.toHaveBeenCalled();
    expect(adapter.finishTargetExecution).not.toHaveBeenCalled();
  });

  it("suppresses late adapter callbacks after package teardown", async () => {
    const editor = makeEditor(30);
    const target = {
      id: 0,
      type: "code",
      executable: true,
      source: "while True: pass",
      editor,
      grammar: pythonGrammar,
    };
    const { adapter } = makeAdapter({ targets: [target] });
    adapter.cancelTargetExecution = jasmine.createSpy("cancelTargetExecution");
    adapter.finishTargetExecution = jasmine.createSpy("finishTargetExecution");
    const kernel = fakeKernel(adapter.getMetadata().kernelspec);
    store.kernelMapping.set(adapter.getPath(), kernel);
    spyOn(result, "createResultAsync").and.returnValue(new Promise(() => {}));

    adapterIntegration.runAdapterTargets(serviceFor(adapter), {}, { scope: "active" });
    await flushPromises();
    adapterIntegration.disposeAdapterIntegration();
    await flushPromises();

    expect(adapter.cancelTargetExecution).not.toHaveBeenCalled();
    expect(adapter.finishTargetExecution).not.toHaveBeenCalled();
  });
});
