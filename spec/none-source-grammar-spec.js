const path = require("node:path");

describe("Jupyter source execution with None", () => {
  let main, store, editor, grammar, execution;

  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("language-python");
    main = (await lumine.packages.activatePackage(path.resolve(__dirname, ".."))).mainModule;
    store = require("../lib/store");
    editor = await lumine.workspace.open("none-source.py");
    editor.setText("first()\nsecond()\n");
    grammar = editor.getGrammar();
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
  });

  afterEach(async () => {
    execution?.dispose();
    execution = null;
    await lumine.packages.deactivatePackage("jupyter-repl");
    editor.destroy();
  });

  it("disables source commands before flattening text or resolving a source context", async () => {
    lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
    expect(editor.getBuffer().getText()).toBe("first()\nsecond()\n");
    const read = spyOn(editor, "getText").and.throwError("None source must not be read");
    const resolve = spyOn(store, "getEmbeddedGrammar").and.callThrough();
    const event = { target: editor.element };
    for (const command of [
      "run",
      "run-and-move-down",
      "run-all-inline",
      "recalculate-all-inline",
      "clear-results",
      "clear-and-restart",
    ])
      expect(lumine.commands.canDispatch(editor.element, "jupyter-repl:" + command))
        .withContext(command)
        .toBe(false);
    await main.run(false, event);
    await main.runAllInline(event);
    const commands = require("../lib/run-commands").createRunCommands({
      store,
      getExecution: () => {
        throw new Error("None must not resolve execution");
      },
      getCellsService: () => null,
      getIntegration: () => {
        throw new Error("None must not resolve adapters");
      },
      getAdapters: () => [],
      isCurrent: () => true,
    });
    await commands.recalculateAllInline(event);
    await commands.clearResults(event);
    await commands.clearAndRestart(event);
    expect(
      await require("../lib/execution-context").captureEditorContext(store, editor),
    ).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();

    lumine.grammars.assignGrammar(editor, grammar);
    expect(lumine.commands.canDispatch(editor.element, "jupyter-repl:run")).toBe(true);
    expect(
      (await require("../lib/execution-context").captureEditorContext(store, editor)).grammar,
    ).toBe(grammar);
  });

  it("retires inline outputs without clearing a shared kernel log and creates a fresh marker owner on resume", () => {
    const markers = store.newMarkerStore(editor.id, editor);
    const bubble = {
      marker: { id: "old", getStartBufferPosition: () => ({ row: 0 }) },
      destroyed: false,
      destroy: jasmine.createSpy("destroy old output"),
    };
    markers.new(bubble);
    const Transport = require("../lib/kernel-transport");
    const Kernel = require("../lib/kernel");
    const transport = new Transport({ display_name: "shared", language: "python" }, grammar);
    transport.setLifecycle("ready");
    transport.setExecutionState("idle");
    const kernel = new Kernel(transport);
    const clear = spyOn(kernel.outputStore, "clear").and.callThrough();
    const shutdown = spyOn(kernel, "destroy").and.callThrough();
    store.runningKernels = [...store.runningKernels, kernel];
    store.kernelMapping.set(editor.getPath(), kernel);

    lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
    expect(markers.destroyed).toBe(true);
    expect(bubble.destroy).toHaveBeenCalledTimes(1);
    expect(store.markersMapping.has(editor.id)).toBe(false);
    expect(store.newMarkerStore(editor.id, editor)).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
    expect(store.kernelMapping.get(editor.getPath())).toBe(kernel);

    lumine.grammars.assignGrammar(editor, grammar);
    expect(store.newMarkerStore(editor.id, editor)).not.toBe(markers);
    store.kernelMapping.delete(editor.getPath());
    kernel.destroy();
  });

  it("cancels pending source preparation immediately when None is selected", async () => {
    let release;
    const manager = {
      startKernelFor: jasmine.createSpy("start kernel").and.returnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      ),
    };
    const result = require("../lib/result");
    const render = spyOn(result, "createResultAsync");
    execution = require("../lib/services/provided/execution").provideJupyterExecution({
      store,
      kernelManager: manager,
      getAdapterServices: () => [],
    });
    const receipt = await execution.execute({
      editor,
      blocks: [{ code: "first()", row: 0, cellType: "code" }],
    });
    expect(receipt.accepted).toBe(true);
    expect(manager.startKernelFor).toHaveBeenCalled();
    lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
    const read = spyOn(editor, "getText").and.throwError("Retired source must not be read");
    expect((await receipt.done).status).toBe("cancelled");
    release(null);
    await Promise.resolve();
    expect(read).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("refuses explicit source service calls and adapter block analysis without a source read", async () => {
    lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
    const read = spyOn(editor, "getText").and.throwError("None source must not be read");
    const selections = spyOn(editor, "getSelections").and.callThrough();
    execution = require("../lib/services/provided/execution").provideJupyterExecution({
      store,
      kernelManager: {},
      getAdapterServices: () => [],
    });
    const receipt = await execution.execute({
      editor,
      grammar,
      blocks: [{ code: "first()", row: 0, cellType: "code" }],
    });
    expect(receipt.accepted).toBe(false);
    const AdapterTargetExecution = require("../lib/adapter-target-execution");
    const targets = new AdapterTargetExecution({ store, documents: {} });
    const target = { id: "cell", type: "code", editor };
    const adapter = { getActiveTargetId: () => target.id, getRunTarget: () => target };
    selections.calls.reset();
    expect(targets.getEditorRunTargets(adapter, false)).toEqual([]);
    expect(targets.isExecutableTarget(target)).toBe(false);
    expect(targets.getMarkerStore(editor)).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(selections).not.toHaveBeenCalled();
  });

  it("detaches running source output on None without interrupting the shared kernel", async () => {
    const Transport = require("../lib/kernel-transport");
    const Kernel = require("../lib/kernel");
    const transport = new Transport({ display_name: "shared", language: "python" }, grammar);
    transport.setLifecycle("ready");
    transport.setExecutionState("idle");
    const kernel = new Kernel(transport);
    kernel.execute = jasmine.createSpy("execute").and.callFake((_code, receive) => {
      kernel.receive = receive;
      return { disposeObservation: jasmine.createSpy("dispose observation") };
    });
    const interrupt = spyOn(kernel, "interrupt");
    const shutdown = spyOn(kernel, "destroy").and.callThrough();
    store.runningKernels = [...store.runningKernels, kernel];
    store.kernelMapping.set(editor.getPath(), kernel);
    const receipt = await main.provideJupyterExecution().execute({
      editor,
      blocks: [{ code: "first()", row: 0, cellType: "code" }],
    });
    expect(receipt.accepted).toBe(true);
    await globalThis.conditionPromise(() => Boolean(kernel.receive));
    const markers = store.markersMapping.get(editor.id);

    lumine.grammars.assignGrammar(editor, lumine.grammars.nullGrammar);
    expect((await receipt.done).status).toBe("cancelled");
    kernel.receive({ output_type: "stream", name: "stdout", text: "late output\n" });
    kernel.receive({ stream: "status", data: "ok" });
    kernel.receive({ output_type: "status", execution_state: "idle" });
    expect(markers.destroyed).toBe(true);
    expect(store.markersMapping.has(editor.id)).toBe(false);
    expect(interrupt).not.toHaveBeenCalled();
    expect(shutdown).not.toHaveBeenCalled();
    expect(store.kernelMapping.get(editor.getPath())).toBe(kernel);
  });
});
