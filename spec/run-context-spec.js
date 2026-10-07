const path = require("node:path");

describe("run command context", () => {
  let main, store, result, first, second, firstKernel, secondKernel, cells;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage(path.resolve(__dirname, ".."));
    main = pack.mainModule;
    store = require("../lib/store");
    result = require("../lib/result");
    first = await lumine.workspace.open();
    first.setText("first()\nnext()\nlast()");
    first.setCursorBufferPosition([0, 0]);
    second = await lumine.workspace.open();
    second.setText("other()");
    second.setCursorBufferPosition([0, 0]);
    firstKernel = kernel();
    secondKernel = kernel();
    store.kernelMapping.set(
      `Unsaved Editor ${first.id}`,
      new Map([[first.getGrammar().name, firstKernel]]),
    );
    store.kernelMapping.set(
      `Unsaved Editor ${second.id}`,
      new Map([[second.getGrammar().name, secondKernel]]),
    );
    activate(first);
  });

  afterEach(async () => {
    cells?.dispose();
    cells = null;
    await lumine.packages.deactivatePackage("jupyter-repl");
    first.destroy();
    second.destroy();
  });

  function kernel() {
    return { outputStore: { clear: jasmine.createSpy("clear output") } };
  }

  function activate(editor) {
    lumine.workspace.paneForItem(editor).activateItem(editor);
    editor.element.focus();
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
  }

  function pendingRestart() {
    let resume;
    firstKernel.restart = () =>
      new Promise((resolve) => {
        resume = () => {
          resolve(true);
        };
      });
    return () => resume();
  }

  it("runs the dispatch editor without switching the active editor", async () => {
    activate(second);
    const single = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: null,
    });
    const receipt = await main.run(false, { target: first.element });
    expect((await receipt.done).status).toBe("ok");
    const [context, block] = single.calls.mostRecent().args;
    expect(context.editor).toBe(first);
    expect(context.kernel).toBe(firstKernel);
    expect(block.code).toBe("first()");
    expect(store.editor).toBe(second);
    expect(store.activePaneItem).toBe(second);
  });

  it("retains the dispatch context while cell preparation waits", async () => {
    let finish;
    first.setSelectedBufferRange([
      [0, 0],
      [0, 7],
    ]);
    cells = main.consumeJupyterCells({
      getCellDescriptors: () => [],
      getExecutionBlocks: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const single = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: null,
    });
    const pending = main.run(false, { target: first.element });
    for (let pass = 0; pass < 5 && !finish; pass++) await Promise.resolve();
    expect(finish).toBeDefined();
    activate(second);
    finish([{ code: "first()", row: 0, cellType: "code" }]);
    const receipt = await pending;
    expect((await receipt.done).status).toBe("ok");
    expect(single.calls.mostRecent().args[0].editor).toBe(first);
    expect(single.calls.mostRecent().args[0].kernel).toBe(firstKernel);
    expect(store.editor).toBe(second);
  });

  it("keeps its editor and above range when a restart outlives a pane switch", async () => {
    first.setCursorBufferPosition([1, 0]);
    const resume = pendingRestart();
    const batch = spyOn(result, "createResultBatch").and.resolveTo({ status: "ok", success: true });
    const [receipt] = await lumine.commands.dispatch(
      first.element,
      "jupyter-repl:recalculate-all-above-inline",
    );
    expect(firstKernel.outputStore.clear).toHaveBeenCalled();
    first.setCursorBufferPosition([2, 0]);
    activate(second);
    resume();
    expect((await receipt.done).status).toBe("ok");
    const [context, blocks] = batch.calls.mostRecent().args;
    expect(context.editor).toBe(first);
    expect(context.kernel).toBe(firstKernel);
    expect(blocks.map((block) => block.code)).toEqual(["first()", "next()"]);
    expect(secondKernel.outputStore.clear).not.toHaveBeenCalled();
  });

  it("retires a prepared run if its editor changes kernel binding", async () => {
    let finish;
    first.setSelectedBufferRange([
      [0, 0],
      [0, 7],
    ]);
    cells = main.consumeJupyterCells({
      getCellDescriptors: () => [],
      getExecutionBlocks: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const single = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: null,
    });
    const pending = main.run(false, { target: first.element });
    for (let pass = 0; pass < 5 && !finish; pass++) await Promise.resolve();
    store.kernelMapping.set(
      `Unsaved Editor ${first.id}`,
      new Map([[first.getGrammar().name, secondKernel]]),
    );
    finish([{ code: "first()", row: 0, cellType: "code" }]);
    await pending;
    expect(single).not.toHaveBeenCalled();
  });

  it("keeps a kernel-less request and its saved path when preparation outlives a pane switch", async () => {
    let finish;
    store.kernelMapping.delete(`Unsaved Editor ${first.id}`);
    spyOnProperty(store, "kernel", "get").and.returnValue(undefined);
    first.setSelectedBufferRange([
      [0, 0],
      [0, 7],
    ]);
    cells = main.consumeJupyterCells({
      getCellDescriptors: () => [],
      getExecutionBlocks: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const start = spyOn(require("../lib/kernel-manager").KernelManager.prototype, "startKernelFor");
    const pending = main.run(false, { target: first.element });
    for (let pass = 0; pass < 5 && !finish; pass++) await Promise.resolve();
    spyOn(first, "getPath").and.returnValue(path.join(process.cwd(), "saved-request.txt"));
    activate(second);
    finish([{ code: "first()", row: 0, cellType: "code" }]);
    await pending;
    expect(start).toHaveBeenCalled();
    expect(start.calls.mostRecent().args[1]).toBe(first);
    expect(start.calls.mostRecent().args[2]).toBe(first.getPath());
  });

  it("retires a recalculation when its source changes during restart", async () => {
    const resume = pendingRestart();
    const batch = spyOn(result, "createResultBatch");
    const single = spyOn(result, "createResultAsync").and.resolveTo({
      status: "ok",
      success: true,
      durationMs: null,
    });
    const [receipt] = await lumine.commands.dispatch(
      first.element,
      "jupyter-repl:recalculate-all-inline",
    );
    first.setText("new_source()");
    resume();
    expect((await receipt.done).status).toBe("cancelled");
    expect(batch).not.toHaveBeenCalled();
    expect(single).not.toHaveBeenCalled();
  });

  it("does not resume a recalculation after package deactivation", async () => {
    const resume = pendingRestart();
    const batch = spyOn(result, "createResultBatch");
    const [receipt] = await lumine.commands.dispatch(
      first.element,
      "jupyter-repl:recalculate-all-inline",
    );
    await lumine.packages.deactivatePackage("jupyter-repl");
    resume();
    expect((await receipt.done).status).toBe("unavailable");
    expect(batch).not.toHaveBeenCalled();
  });

  it("cancels a captured recalculation if its source editor changes kernel during restart", async () => {
    const resume = pendingRestart();
    const batch = spyOn(result, "createResultBatch").and.resolveTo({ status: "ok", success: true });
    const [receipt] = await lumine.commands.dispatch(
      first.element,
      "jupyter-repl:recalculate-all-inline",
    );
    store.kernelMapping.set(
      `Unsaved Editor ${first.id}`,
      new Map([[first.getGrammar().name, secondKernel]]),
    );
    resume();
    expect((await receipt.done).status).toBe("cancelled");
    expect(batch).not.toHaveBeenCalled();
  });
});
