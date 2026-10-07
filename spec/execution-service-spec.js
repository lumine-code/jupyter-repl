const path = require("node:path");
const { Emitter } = require("lumine");
const manifest = require(path.join(__dirname, "..", "package.json"));
let main, result, store;

const block = (code = "first()", row = 0, cellType = "code") => ({ code, row, cellType });
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

describe("the explicit jupyter.execution service", () => {
  let editor,
    execution,
    fakeKernel,
    filePath,
    previousEditor,
    previousActivePaneItem,
    manager,
    adapters;

  beforeEach(async () => {
    main = require(path.join(__dirname, "..", manifest.main));
    result = require("../lib/result");
    store = require("../lib/store");
    previousEditor = store.editor;
    previousActivePaneItem = store.activePaneItem;
    editor = await lumine.workspace.open();
    editor.setText("first()\nsecond()\nthird()");
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    filePath = store.filePath;
    fakeKernel = {};
    store.kernelMapping.set(filePath, new Map([[store.grammar.name, fakeKernel]]));
    manager = { startKernelFor: jasmine.createSpy("start kernel").and.resolveTo(null) };
    adapters = [];
    execution = require("../lib/services/provided/execution").provideJupyterExecution({
      store,
      kernelManager: manager,
      getAdapterServices: () => adapters,
    });
  });

  afterEach(() => {
    execution.dispose();
    store.markers?.clear();
    store.markersMapping.delete(editor.id);
    store.kernelMapping.delete(filePath);
    store.updateEditor(previousEditor);
    store.updateActivePaneItem(previousActivePaneItem);
    if (!editor.isDestroyed()) editor.destroy();
  });

  it("accepts a single block before its execution completes", async () => {
    let complete;
    const single = spyOn(result, "createResultAsync").and.returnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const batch = spyOn(result, "createResultBatch");
    const receipt = await execution.execute({ item: editor, editor, blocks: [block()] });
    expect(receipt.accepted).toBe(true);
    let settled = false;
    receipt.done.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    expect(single.calls.mostRecent().args[0].editor).toBe(editor);
    expect(single.calls.mostRecent().args[1].code).toBe("first()");
    expect(batch).not.toHaveBeenCalled();
    complete({ status: "ok", success: true });
    expect((await receipt.done).status).toBe("ok");
  });

  it("reports batch completion independently from acceptance", async () => {
    const batch = spyOn(result, "createResultBatch").and.resolveTo({
      status: "error",
      success: false,
    });
    const receipt = await execution.execute({ editor, blocks: [block(), block("second()", 1)] });
    expect(receipt.accepted).toBe(true);
    expect((await receipt.done).status).toBe("error");
    expect(batch.calls.mostRecent().args[1].length).toBe(2);
  });

  it("preserves unknown execution outcome metadata through the facade receipt", async () => {
    const terminal = {
      status: "unknown",
      success: false,
      requestId: "request-unknown",
      generation: 4,
      executionCount: 18,
      durationMs: 25,
      error: { ename: "ExecutionOutcomeUnknown", evalue: "Execution may have run.", traceback: [] },
    };
    spyOn(result, "createResultAsync").and.resolveTo(terminal);
    const receipt = await execution.execute({ editor, blocks: [block()] });
    expect(receipt.accepted).toBe(true);
    expect(await receipt.done).toEqual(terminal);
  });

  it("refuses incomplete invocations without redirecting to the active editor", async () => {
    const single = spyOn(result, "createResultAsync");
    for (const request of [
      { editor, blocks: [] },
      { blocks: [block()] },
      { item: {}, editor, blocks: [block()] },
    ]) {
      const receipt = await execution.execute(request);
      expect(receipt.accepted).toBe(false);
      expect((await receipt.done).status).toBe("unavailable");
    }
    expect(single).not.toHaveBeenCalled();
  });

  it("renders Markdown without selecting a kernel", async () => {
    store.kernelMapping.delete(filePath);
    const render = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
    });
    const receipt = await execution.execute({
      editor,
      blocks: [block("# Heading", 0, "markdown")],
    });
    expect(receipt.accepted).toBe(true);
    expect((await receipt.done).status).toBe("ok");
    expect(manager.startKernelFor).not.toHaveBeenCalled();
    expect(render.calls.mostRecent().args[0].kernel).toBeNull();
    expect(render.calls.mostRecent().args[1].code).toBe("# Heading");
  });

  it("skips raw source before allocating output or choosing a kernel", async () => {
    store.kernelMapping.delete(filePath);
    const markerCount = store.markersMapping.size;
    const render = spyOn(result, "createResultAsync");
    const batch = spyOn(result, "createResultBatch");
    const receipt = await execution.execute({ editor, blocks: [block("dangerous()", 0, "raw")] });
    expect(receipt.accepted).toBe(true);
    expect((await receipt.done).status).toBe("ok");
    expect(manager.startKernelFor).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(store.markersMapping.size).toBe(markerCount);
  });

  it("renders leading Markdown before the picker and retains the captured remaining order", async () => {
    store.kernelMapping.delete(filePath);
    let select;
    manager.startKernelFor.and.returnValue(
      new Promise((resolve) => {
        select = resolve;
      }),
    );
    const render = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
    });
    const batch = spyOn(result, "createResultBatch").and.resolveTo({ status: "ok", success: true });
    const receipt = await execution.execute({
      editor,
      blocks: [
        block("# Before", 0, "markdown"),
        block("ignored()", 1, "raw"),
        block("run()", 2),
        block("# After", 3, "markdown"),
      ],
    });
    await flush();
    expect(receipt.accepted).toBe(true);
    expect(render.calls.count()).toBe(1);
    expect(render.calls.mostRecent().args[1].code).toBe("# Before");
    expect(manager.startKernelFor).toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    store.kernelMapping.set(filePath, new Map([[editor.getGrammar().name, fakeKernel]]));
    select(fakeKernel);
    expect((await receipt.done).status).toBe("ok");
    expect(batch.calls.mostRecent().args[1].map((entry) => entry.code)).toEqual([
      "run()",
      "# After",
    ]);
  });

  it("settles a canceled picker even though the invocation was accepted", async () => {
    store.kernelMapping.delete(filePath);
    const receipt = await execution.execute({ editor, blocks: [block()] });
    expect(receipt.accepted).toBe(true);
    expect((await receipt.done).status).toBe("cancelled");
  });

  it("settles owner closure before a pending picker answers and suppresses late dispatch", async () => {
    store.kernelMapping.delete(filePath);
    let select;
    manager.startKernelFor.and.returnValue(
      new Promise((resolve) => {
        select = resolve;
      }),
    );
    const render = spyOn(result, "createResultAsync");
    const receipt = await execution.execute({ editor, blocks: [block()] });
    editor.destroy();
    expect((await receipt.done).status).toBe("cancelled");
    select(fakeKernel);
    await flush();
    expect(render).not.toHaveBeenCalled();
  });

  it("settles aborted observation and ignores a delayed kernel", async () => {
    store.kernelMapping.delete(filePath);
    let select;
    manager.startKernelFor.and.returnValue(
      new Promise((resolve) => {
        select = resolve;
      }),
    );
    const render = spyOn(result, "createResultAsync");
    const controller = new AbortController();
    const receipt = await execution.execute({
      editor,
      blocks: [block()],
      signal: controller.signal,
    });
    controller.abort();
    expect((await receipt.done).status).toBe("cancelled");
    select(fakeKernel);
    await flush();
    expect(render).not.toHaveBeenCalled();
  });

  it("retires pending receipts and refuses work after provider teardown", async () => {
    store.kernelMapping.delete(filePath);
    manager.startKernelFor.and.returnValue(new Promise(() => {}));
    const receipt = await execution.execute({ editor, blocks: [block()] });
    execution.dispose();
    expect((await receipt.done).status).toBe("unavailable");
    const next = await execution.execute({ editor, blocks: [block()] });
    expect(next.accepted).toBe(false);
    expect((await next.done).status).toBe("unavailable");
  });

  it("restarts and clears the explicit editor before running its captured blocks", async () => {
    const order = [];
    fakeKernel.restart = jasmine.createSpy("restart").and.callFake(async () => {
      order.push("restart");
      return true;
    });
    spyOn(result, "clearResults").and.callFake((context) => {
      expect(context.kernel).toBe(fakeKernel);
      order.push("clear");
    });
    spyOn(result, "createResultAsync").and.callFake(async () => {
      order.push("run");
      return { status: "ok", success: true };
    });
    const receipt = await execution.execute({
      editor,
      blocks: [block()],
      restart: true,
      clear: true,
    });
    expect((await receipt.done).status).toBe("ok");
    expect(order).toEqual(["clear", "restart", "run"]);
  });

  it("routes an inactive notebook item and its snapshots without asking for the active adapter", async () => {
    const events = new Emitter();
    const item = { isDestroyed: () => false };
    const owner = {
      isDestroyed: () => false,
      onDidDestroy: (callback) => events.on("destroy", callback),
    };
    const current = { getKernelOwner: () => owner };
    const resolver = {
      getAdapterForItem: (candidate) => (candidate === item ? current : null),
      getActiveAdapter: jasmine.createSpy("active adapter"),
    };
    adapters.push(resolver);
    const targets = [{ id: "original", source: "original()" }];
    const integration = require("../lib/adapter-integration");
    spyOn(integration, "getKernelForAdapter").and.returnValue(null);
    const run = spyOn(integration, "runAdapterTargets").and.callFake(
      (_services, _manager, request) => {
        request.onComplete({ status: "ok" });
        return true;
      },
    );
    try {
      const receipt = await execution.execute({ item, owner, targets, scope: "active" });
      expect(receipt.accepted).toBe(true);
      expect((await receipt.done).status).toBe("ok");
      expect(resolver.getActiveAdapter).not.toHaveBeenCalled();
      expect(run.calls.mostRecent().args[2]).toEqual(
        jasmine.objectContaining({ adapter: current, targets }),
      );
    } finally {
      events.dispose();
    }
  });

  it("imports saved outputs through the output service and the explicit editor's marker store", () => {
    const imported = spyOn(result, "importResult");
    require("../lib/output-service").outputService.importOutputs(editor, {
      outputs: [{ output_type: "stream" }],
      row: 1,
    });
    const [context, bundle] = imported.calls.mostRecent().args;
    expect(context.editor).toBe(editor);
    expect(context.markers).toBe(store.markersMapping.get(editor.id));
    expect(bundle.row).toBe(1);
  });

  it("settles a notebook receipt when a provider fails while resolving a captured target", async () => {
    const item = { isDestroyed: () => false };
    const notebookPath = "C:/work/failing-target-provider.ipynb";
    const owner = {
      id: "failing-target",
      getPath: () => notebookPath,
      isDestroyed: () => false,
      onDidDestroy: () => ({ dispose() {} }),
      onDidChangePath: () => ({ dispose() {} }),
    };
    const target = { id: "target", editor, source: "first()", type: "code", executable: true };
    const adapter = {
      getPaneItem: () => item,
      getKernelOwner: () => owner,
      getPath: () => notebookPath,
      getTitle: () => "Failing target provider",
      getMetadata: () => ({}),
      getKernelLanguage: () => "python",
      getKernelGrammar: () => editor.getGrammar(),
      getActiveTargetId: () => target.id,
      getKernelTarget: () => target,
      getRunTarget() {
        throw new Error("target resolution failed");
      },
    };
    adapters.push({ getAdapterForItem: (candidate) => (candidate === item ? adapter : null) });
    const integration = require("../lib/adapter-integration");
    integration.activateAdapterIntegration();
    store.kernelMapping.set(notebookPath, fakeKernel);
    try {
      const receipt = await execution.execute({ item, owner, targets: [target] });
      let outcome = null;
      receipt.done.then((value) => {
        outcome = value;
      });
      await flush();
      expect(outcome).toEqual(jasmine.objectContaining({ status: "error" }));
    } finally {
      store.kernelMapping.delete(notebookPath);
      integration.disposeAdapterIntegration();
    }
  });
});

describe("the optional jupyter.cells consumption", () => {
  let codeManager;

  beforeEach(() => {
    main = require(path.join(__dirname, "..", manifest.main));
    store = require("../lib/store");
    codeManager = require("../lib/code-manager");
  });

  it("clips a block at a cell boundary only while the service is present", async () => {
    const editor = await lumine.workspace.open();
    editor.setText("a = 1\nb = 2\n");

    // Without the service there is no marker model, so nothing clips and the
    // row answers as a plain single-line block.
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("b = 2");

    // A service claiming the row belongs to a later cell turns the block empty.
    const disposable = main.consumeJupyterCells({
      getCell: () => ({ start: { row: 2 }, end: { row: 3 } }),
      getCurrentCell: () => null,
      getCellDescriptors: async () => [],
      getExecutionBlocks: async () => [],
    });
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("");

    disposable.dispose();
    expect(codeManager.findCodeBlockAtRow(editor, 1).code).toBe("b = 2");
    editor.destroy();
  });

  it("answers null from getCellRange without the cell model", () => {
    const provider = main.provideJupyterContext();
    expect(main.getJupyterCellsService()).toBeNull();
    expect(provider.getCellRange()).toBeNull();
  });
});
