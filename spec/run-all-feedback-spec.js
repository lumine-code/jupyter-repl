const { Range } = require("lumine");
let run = require("../lib/main").run;
let runAllInline = require("../lib/main").runAllInline;
let result = require("../lib/result");
let store = require("../lib/store");

describe("batch inline feedback", () => {
  let editor;
  let fakeKernel;
  let filePath;
  let markers;
  let previousEditor;
  let previousActivePaneItem;
  let previousOutputAreaDefault;
  let previousResizeObserver;

  async function waitForExecutions(count) {
    for (let turn = 0; turn < 12 && fakeKernel.executions.length < count; turn++)
      await Promise.resolve();
    expect(fakeKernel.executions.length).toBe(count);
  }

  const resultAtRow = (row) =>
    [...markers.markers.values()].find(
      (resultView) => resultView.marker.getStartBufferPosition().row === row,
    );

  beforeEach(async () => {
    const pack = await lumine.packages.activatePackage(
      require("node:path").resolve(__dirname, ".."),
    );
    ({ run, runAllInline } = pack.mainModule);
    result = require("../lib/result");
    store = require("../lib/store");
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
    require("./helpers/session").wrapSession(fakeKernel);
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
      { code: "first()", row: 0, cellType: "code" },
      { code: "second()", row: 1, cellType: "code" },
      { code: "third()", row: 2, cellType: "code" },
    ]);

    // Let the resolved first execution advance the queue to the second block.
    await waitForExecutions(2);
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

    expect(await batchPromise).toEqual(
      jasmine.objectContaining({ status: "error", success: false }),
    );
    expect(resultAtRow(2).outputStore.status).toBe("error");
    expect(fakeKernel.executions.length).toBe(2);
  });

  it("drops a batch asked for while one is already running", async () => {
    // A held run-all keybinding repeats faster than any batch finishes; each
    // repeat is the same request already being served, and queueing it again
    // would duplicate every cell at the kernel.
    const blocks = [{ code: "first()", row: 0, cellType: "code" }];
    const batchPromise = result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks);

    const repeats = await Promise.all([
      result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks),
      result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks),
    ]);

    expect(repeats.map(({ status, success }) => ({ status, success }))).toEqual([
      { status: "skipped", success: true },
      { status: "skipped", success: true },
    ]);
    expect(fakeKernel.executions.length).toBe(1);

    await batchPromise;

    // The next deliberate run, after the batch finished, goes through.
    const again = result.createResultBatch({ editor, kernel: fakeKernel, markers }, blocks);
    await waitForExecutions(2);
    fakeKernel.executions[1].callback({ data: "ok", stream: "status" });
    fakeKernel.executions[1].callback({ output_type: "status", execution_state: "idle" });
    await again;
  });

  it("leaves the cursor where the user put it", async () => {
    // The old inline loop walked the cursor to each cell as it ran — progress
    // feedback the queued/running bubbles now give without stealing the
    // user's position mid-run.
    editor.setCursorBufferPosition([2, 4]);

    fakeKernel.execute = (code, callback) => {
      fakeKernel.executions.push({ code, callback });
      callback({ data: "ok", stream: "status" });
      callback({ output_type: "status", execution_state: "idle" });
    };
    const receipt = await runAllInline();
    await receipt.done;

    expect(fakeKernel.executions.length).toBeGreaterThan(0);
    expect(editor.getCursorBufferPosition().toArray()).toEqual([2, 4]);
  });

  it("routes multi-selection run through the shared batch path", async () => {
    const batchSpy = spyOn(result, "createResultBatch").and.resolveTo({
      status: "ok",
      success: true,
    });
    editor.setSelectedBufferRanges([
      new Range([0, 0], [0, 7]),
      new Range([1, 0], [1, 8]),
      new Range([2, 0], [2, 7]),
    ]);

    await run();
    expect(batchSpy).toHaveBeenCalled();
    expect(batchSpy.calls.mostRecent().args[1].length).toBe(3);
  });

  it("releases the batch and marks pending results when sending fails synchronously", async () => {
    spyOn(fakeKernel, "execute").and.throwError("send failed");
    const batch = result.createResultBatch({ editor, kernel: fakeKernel, markers }, [
      { code: "first()", row: 0, cellType: "code" },
      { code: "second()", row: 1, cellType: "code" },
    ]);

    expect(await batch).toEqual(jasmine.objectContaining({ status: "error", success: false }));

    expect(fakeKernel.batchInFlight).toBe(false);
    expect(resultAtRow(0).outputStore.status).toBe("error");
    expect(resultAtRow(1).outputStore.status).toBe("error");
  });

  it("stops before running the next block when the editor closes mid-batch", async () => {
    const batch = result.createResultBatch({ editor, kernel: fakeKernel, markers }, [
      { code: "first()", row: 0, cellType: "code" },
      { code: "second()", row: 1, cellType: "code" },
      { code: "third()", row: 2, cellType: "code" },
    ]);
    await waitForExecutions(2);
    expect(fakeKernel.executions.length).toBe(2);
    editor.destroy();
    fakeKernel.executions[1].callback({ data: "ok", stream: "status" });
    fakeKernel.executions[1].callback({ output_type: "status", execution_state: "idle" });

    expect(await batch).toEqual(jasmine.objectContaining({ status: "cancelled", success: false }));
    expect(fakeKernel.executions.length).toBe(2);
    expect(fakeKernel.batchInFlight).toBe(false);
  });

  it("keeps an unknown first execution outcome and leaves later blocks unsent", async () => {
    fakeKernel.execute = (code, callback) => {
      fakeKernel.executions.push({ code, callback });
      callback({
        output_type: "error",
        ename: "ExecutionOutcomeUnknown",
        evalue: "Execution may have run.",
        traceback: [],
      });
      callback({ data: "error", stream: "status" });
      callback({ output_type: "status", execution_state: "idle" });
    };
    const outcome = await result.createResultBatch({ editor, kernel: fakeKernel, markers }, [
      { code: "first()", row: 0, cellType: "code" },
      { code: "second()", row: 1, cellType: "code" },
    ]);
    expect(outcome.status).toBe("unknown");
    expect(outcome.success).toBe(false);
    expect(outcome.results.map((entry) => entry.status)).toEqual(["unknown"]);
    expect(fakeKernel.executions.length).toBe(1);
    expect(resultAtRow(1).outputStore.status).toBe("error");
  });
});
