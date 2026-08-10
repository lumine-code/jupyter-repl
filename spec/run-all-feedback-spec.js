const { Point, Range } = require("lumine");
const { run, runAll, runAllInline } = require("../lib/main");
const result = require("../lib/result");
const store = require("../lib/store");

describe("batch inline feedback", () => {
  let editor;
  let fakeKernel;
  let filePath;
  let markers;
  let previousEditor;
  let previousActivePaneItem;
  let previousOutputAreaDefault;
  let previousResizeObserver;

  const resultAtRow = (row) =>
    [...markers.markers.values()].find(
      (resultView) => resultView.marker.getStartBufferPosition().row === row,
    );

  beforeEach(async () => {
    previousEditor = store.editor;
    previousActivePaneItem = store.activePaneItem;
    previousOutputAreaDefault = lumine.config.get("jupyter-repl.outputAreaDefault");
    previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    lumine.config.set("jupyter-repl.outputAreaDefault", false);

    editor = await lumine.workspace.open();
    editor.setText("first()\nsecond()\nthird()");
    store.updateEditor(editor);
    store.updateActivePaneItem(editor);
    filePath = store.filePath;
    markers = store.markers;

    fakeKernel = {
      executions: [],
      setLastOutputStore() {},
      execute(code, callback) {
        this.executions.push({ code, callback });

        // The first block finishes within the result marker's delay. Its final
        // status should replace the pending state without exposing a spinner.
        if (this.executions.length === 1) {
          callback({ data: "ok", stream: "status" });
          callback({ output_type: "status", execution_state: "idle" });
        }
      },
    };
    store.kernelMapping.set(filePath, new Map([[store.grammar.name, fakeKernel]]));
    // MobX deep-wraps plain objects stored in an observable map. Use the
    // active wrapped instance for assertions and callbacks.
    fakeKernel = store.kernel;
  });

  afterEach(() => {
    markers.clear();
    store.markersMapping.delete(editor.id);
    store.kernelMapping.delete(filePath);
    store.updateEditor(previousEditor);
    store.updateActivePaneItem(previousActivePaneItem);
    lumine.config.set("jupyter-repl.outputAreaDefault", previousOutputAreaDefault);
    global.ResizeObserver = previousResizeObserver;
    editor.destroy();
  });

  it("reserves all positions, preserves fast results, and X-marks skipped blocks", async () => {
    const batchPromise = result.createResultBatch({ editor, kernel: fakeKernel, markers }, [
      { code: "first()", row: 0, cellType: "codecell" },
      { code: "second()", row: 1, cellType: "codecell" },
      { code: "third()", row: 2, cellType: "codecell" },
    ]);

    // Let the resolved first execution advance the queue to the second block.
    await Promise.resolve();
    await Promise.resolve();
    if (fakeKernel.executions.length !== 2) {
      throw new Error(`Expected the second block to start; got ${fakeKernel.executions.length}`);
    }
    expect(resultAtRow(0).outputStore.status).toBe("ok");

    window.advanceClock(25);
    expect(markers.markers.size).toBe(3);
    // The second block has been sent but the kernel has not begun it, and the
    // third is still waiting behind it — both read as queued, not running.
    expect(resultAtRow(1).outputStore.status).toBe("queued");
    expect(resultAtRow(2).outputStore.status).toBe("queued");

    const secondExecution = fakeKernel.executions[1];
    // execute_input from the kernel is what turns a queued cell into a
    // running one — the store hears it as the execution_count stream.
    secondExecution.callback({ data: 2, stream: "execution_count" });
    expect(resultAtRow(1).outputStore.status).toBe("running");
    expect(resultAtRow(2).outputStore.status).toBe("queued");

    secondExecution.callback({ data: "error", stream: "status" });
    secondExecution.callback({ output_type: "status", execution_state: "idle" });

    expect(await batchPromise).toBe(false);
    expect(resultAtRow(2).outputStore.status).toBe("error");
    expect(fakeKernel.executions.length).toBe(2);
  });

  it("drops a batch asked for while one is already running", async () => {
    // A held run-all keybinding repeats faster than any batch finishes; each
    // repeat is the same request already being served, and queueing it again
    // would duplicate every cell at the kernel.
    const blocks = [{ code: "first()", row: 0, cellType: "codecell" }];
    const batchPromise = result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks);

    const repeats = await Promise.all([
      result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks),
      result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks),
    ]);

    expect(repeats).toEqual([true, true]);
    expect(fakeKernel.executions.length).toBe(1);

    await batchPromise;

    // The next deliberate run, after the batch finished, goes through.
    const again = result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks);
    expect(fakeKernel.executions.length).toBe(2);
    fakeKernel.executions[1].callback({ data: "ok", stream: "status" });
    fakeKernel.executions[1].callback({ output_type: "status", execution_state: "idle" });
    await again;
  });

  it("leaves the cursor where the user put it", () => {
    // The old inline loop walked the cursor to each cell as it ran — progress
    // feedback the queued/running bubbles now give without stealing the
    // user's position mid-run.
    editor.setCursorBufferPosition([2, 4]);

    runAllInline();

    expect(fakeKernel.executions.length).toBeGreaterThan(0);
    expect(editor.getCursorBufferPosition().toArray()).toEqual([2, 4]);
  });

  it("routes run-all through the shared batch path", () => {
    const batchSpy = spyOn(result, "createResultBatch").and.returnValue(Promise.resolve(true));
    runAll([new Point(0, 7), new Point(1, 8), new Point(2, 7)]);

    expect(batchSpy).toHaveBeenCalled();
    expect(batchSpy.calls.mostRecent().args[1].length).toBe(3);
  });

  it("routes multi-selection run through the shared batch path", () => {
    const batchSpy = spyOn(result, "createResultBatch").and.returnValue(Promise.resolve(true));
    editor.setSelectedBufferRanges([
      new Range([0, 0], [0, 7]),
      new Range([1, 0], [1, 8]),
      new Range([2, 0], [2, 7]),
    ]);

    run();
    expect(batchSpy).toHaveBeenCalled();
    expect(batchSpy.calls.mostRecent().args[1].length).toBe(3);
  });
});
