const ResultView = require("./components/result-view");
const OutputPane = require("./panes/output-area");
const { OUTPUT_TYPES } = require("./output-utils");
const { OUTPUT_AREA_URI, openOrShowDock, log } = require("./utils");
const { captureExecution } = require("./traceback-context");

const RESULT_ITEM_CHANGE_DELAY_MS = 10;
const localBatches = new WeakSet();

function shouldFlushResultItem(message) {
  return (
    OUTPUT_TYPES.includes(message?.output_type) ||
    message?.stream === "status" ||
    message?.stream === "error"
  );
}

function getGlobalOutputStore(kernel, inline = true) {
  if (!inline || !kernel) {
    return null;
  }
  // Walks every pane item, so a batch resolves this once rather than per cell.
  return lumine.config.get("jupyter-repl.outputAreaDefault") ||
    lumine.workspace.getPaneItems().some((item) => item instanceof OutputPane)
    ? kernel.outputStore
    : null;
}

function shouldShowInlineResult(globalOutputStore, cellType, showResult = null) {
  return showResult === null ? !globalOutputStore || cellType === "markdown" : showResult;
}

function createDebouncedResultItem(markers, editor, row, showResult = true) {
  let resultView = null;
  let pendingTimer = null;
  const pendingOutputs = [];

  const flush = () => {
    if (resultView) return resultView;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    if (editor.isDestroyed?.()) return null;

    resultView = new ResultView(markers, editor, row, showResult);
    pendingOutputs.splice(0).forEach((output) => {
      resultView.outputStore.appendOutput(output);
    });
    return resultView;
  };

  pendingTimer = setTimeout(flush, RESULT_ITEM_CHANGE_DELAY_MS);

  return {
    appendOutput(message) {
      if (resultView) {
        resultView.outputStore.appendOutput(message);
        return;
      }

      pendingOutputs.push(message);
      if (shouldFlushResultItem(message)) {
        flush();
      }
    },
  };
}

/**
 * Reserve an inline result position before its code starts executing.
 *
 * The marker uses the same short delay as a normal `run`, so quick results
 * replace the pending state before a loading bubble is rendered. This is used
 * by batch commands to make every future result position visible while the
 * earlier cells are still running.
 */
function createPendingResult(
  { editor, kernel, markers },
  { row, cellType, showResult = null, globalOutputStore },
) {
  if (
    !editor ||
    editor.isDestroyed?.() ||
    !markers ||
    cellType === "raw" ||
    (cellType === "code" && !kernel)
  ) {
    return null;
  }
  if (globalOutputStore === undefined) {
    globalOutputStore = cellType === "code" ? getGlobalOutputStore(kernel) : null;
  }
  return createDebouncedResultItem(
    markers,
    editor,
    row,
    shouldShowInlineResult(globalOutputStore, cellType, showResult),
  );
}

/**
 * Execute multiple result-producing blocks sequentially with all of their
 * pending positions reserved before the first block starts.
 */
async function createResultBatch({ editor, kernel, markers }, codeBlocks) {
  codeBlocks = codeBlocks.filter((block) => block.cellType !== "raw");
  if (
    !editor ||
    editor.isDestroyed?.() ||
    !markers ||
    codeBlocks.length === 0 ||
    (!kernel && codeBlocks.some((block) => block.cellType === "code"))
  ) {
    return {
      status: editor?.isDestroyed?.() ? "cancelled" : "ok",
      success: !editor?.isDestroyed?.(),
    };
  }

  // One batch per kernel at a time. A held run-all keybinding repeats faster
  // than any batch finishes, and each repeat would queue every cell again —
  // hundreds of duplicate executions that fill the socket's high-water mark
  // and wedge the connection. A batch asked for while one is running is the
  // same request already being served; drop it.
  if (kernel?.batchInFlight || (!kernel && localBatches.has(editor))) {
    log("createResultBatch: batch already running on this kernel, dropped");
    return { status: "skipped", success: true, reason: "batch already running" };
  }
  if (kernel) kernel.batchInFlight = true;
  else localBatches.add(editor);

  let pendingResults = [];
  const results = [];
  try {
    const executionContext = { editor, kernel, markers };
    // The dock cannot open or close while the batch runs, so resolve it once
    // instead of walking every pane item twice per cell.
    const globalOutputStore = getGlobalOutputStore(kernel);
    pendingResults = codeBlocks.map((codeBlock) =>
      createPendingResult(executionContext, { ...codeBlock, globalOutputStore }),
    );

    for (let index = 0; index < codeBlocks.length; index++) {
      if (editor.isDestroyed?.()) return { status: "cancelled", success: false, results };
      const codeBlock = codeBlocks[index];
      const outcome = await createResultAsync(executionContext, {
        ...codeBlock,
        globalOutputStore,
        pendingResult: pendingResults[index],
      });
      results.push({
        requestId: outcome.requestId,
        generation: outcome.generation,
        status: outcome.status,
        executionCount: outcome.executionCount,
        durationMs: outcome.durationMs,
      });
      if (!outcome.success) {
        // Later blocks will not execute after a failure. Reuse the existing
        // error status so each remaining queued bubble becomes an X.
        for (const pendingResult of pendingResults.slice(index + 1)) {
          pendingResult?.appendOutput({
            data: "error",
            stream: "status",
          });
        }
        return { ...outcome, results };
      }
    }
    return { status: "ok", success: true, results };
  } catch (error) {
    // A synchronous send failure rejects the active result's promise before
    // any kernel terminal messages exist. Retire the reserved positions too.
    for (const pendingResult of pendingResults) {
      try {
        pendingResult?.appendOutput({ data: "error", stream: "status" });
      } catch (deliveryError) {
        log("createResultBatch: failed to retire a pending result:", deliveryError);
      }
    }
    throw error;
  } finally {
    if (kernel) kernel.batchInFlight = false;
    else localBatches.delete(editor);
  }
}

/**
 * Creates and renders a ResultView.
 *
 * @param {Object} store - Global Jupyter Store
 * @param {TextEditor} store.editor - TextEditor associated with the result.
 * @param {Kernel} store.kernel - Kernel to run code and associate with the result.
 * @param {MarkerStore} store.markers - MarkerStore that belongs to `store.editor`.
 * @param {Object} codeBlock - A Jupyter Cell.
 * @param {String} codeBlock.code - Source string of the cell.
 * @param {Number} codeBlock.row - Row to display the result on.
 * @param {JupyterCellType} codeBlock.cellType - Cell type of the cell.
 */
function createResult(context, { code, row, cellType }) {
  runResult(context, { code, row, cellType });
}

/**
 * Creates inline results from Kernel Responses without a tie to a kernel.
 *
 * @param {Store} store - Jupyter store
 * @param {TextEditor} store.editor - The editor to display the results in.
 * @param {MarkerStore} store.markers - Should almost always be the editor's `MarkerStore`
 * @param {Object} bundle - The bundle to display.
 * @param {Object[]} bundle.outputs - The Kernel Responses to display.
 * @param {Number} bundle.row - The editor row to display the results on.
 */
function importResult({ editor, markers }, { outputs, row }) {
  if (!editor || !markers) {
    return;
  }
  const { outputStore } = new ResultView(
    markers,
    editor,
    row, // Always show inline
    true,
  );

  for (const output of outputs) {
    outputStore.appendOutput(output);
  }
}

/**
 * Clears a ResultView or selection of ResultViews. To select a result to clear,
 * put your cursor on the row on the ResultView. To select multiple ResultViews,
 * select text starting on the row of the first ResultView to remove all the way
 * to text on the row of the last ResultView to remove. _This must be one
 * selection and the last selection made_
 *
 * @param {Object} store - Global Jupyter Store
 * @param {TextEditor} store.editor - TextEditor associated with the ResultView.
 * @param {MarkerStore} store.markers - MarkerStore that belongs to
 *   `store.editor` and the ResultView.
 */
function clearResult({ editor, markers }) {
  if (!editor || !markers) {
    return;
  }
  const [startRow, endRow] = editor.getLastSelection().getBufferRowRange();

  for (let row = startRow; row <= endRow; row++) {
    markers.clearOnRow(row);
  }
}

/**
 * Clears all ResultViews of a MarkerStore. It also clears the currect kernel results.
 *
 * @param {Object} store - Global Jupyter Store
 * @param {Kernel} store.kernel - Kernel to clear outputs.
 * @param {MarkerStore} store.markers - MarkerStore to clear.
 */
function clearResults({ kernel, markers }) {
  if (markers) {
    markers.clear();
  }
  if (kernel) {
    kernel.outputStore.clear();
  }
}

/**
 * Converts a string of raw markdown to a display_data Kernel Response. This
 * allows for jupyter-repl to display markdown text as if is was any normal result
 * that came back from the kernel.
 *
 * @param {String} markdownString - A string of raw markdown code.
 * @returns {Object} A fake display_data Kernel Response.
 */
function convertMarkdownToOutput(markdownString) {
  return {
    output_type: "display_data",
    data: {
      "text/markdown": markdownString,
    },
    metadata: {},
  };
}

/**
 * Creates and renders a ResultView, returning a Promise that resolves when execution completes.
 * This is used for sequential cell execution where we need to wait for each cell to finish.
 *
 * @param {Object} store - Global Jupyter Store
 * @param {TextEditor} store.editor - TextEditor associated with the result.
 * @param {Kernel} store.kernel - Kernel to run code and associate with the result.
 * @param {MarkerStore} store.markers - MarkerStore that belongs to `store.editor`.
 * @param {Object} codeBlock - A Jupyter Cell.
 * @param {String} codeBlock.code - Source string of the cell.
 * @param {Number} codeBlock.row - Row to display the result on.
 * @param {JupyterCellType} codeBlock.cellType - Cell type of the cell.
 * @returns {Promise<{success: Boolean, durationMs: ?Number}>} Resolves once the
 *   execution has both its reply and its trailing idle. `durationMs` measures
 *   this execution alone, from its own execute_input to its reply; null for
 *   cells that never reach the kernel (markdown, blank, guards).
 */
function createResultAsync(context, codeBlock) {
  return new Promise((resolve) => runResult(context, codeBlock, resolve));
}

// Human runs, sequential batches and editorless execution use the same sink
// selection and dispatch. The synchronous entry point keeps its immediate
// error behavior; awaiting callers guard delivery and settle on reply + idle.
function runResult(
  { editor, kernel, markers },
  {
    code,
    row,
    cellType,
    onResult,
    showResult = null,
    inline = true,
    dock = false,
    pendingResult = null,
    globalOutputStore,
    signal,
  },
  resolve,
) {
  const complete = (success, durationMs = null, outcome = {}) =>
    resolve?.({ status: success ? "ok" : "error", ...outcome, success, durationMs });
  if (editor?.isDestroyed?.()) {
    complete(false, null, { status: "cancelled" });
    return;
  }
  if (
    (!editor && !dock) ||
    cellType === "raw" ||
    (cellType === "code" && !kernel) ||
    (inline && !markers)
  ) {
    complete(true);
    return;
  }
  if (!resolve) editor.terminatePendingState();

  if (dock && kernel) {
    globalOutputStore = kernel.outputStore;
  } else if (cellType === "markdown") {
    globalOutputStore = null;
  } else if (globalOutputStore === undefined) {
    globalOutputStore = getGlobalOutputStore(kernel, inline);
  } else if (!inline) {
    globalOutputStore = null;
  }
  if ((inline || dock) && globalOutputStore) {
    openOrShowDock(OUTPUT_AREA_URI);
  }

  const hasCode = code.search(/\S/) !== -1;
  if (hasCode && cellType !== "code" && cellType !== "markdown") {
    // An unknown cell type must still settle, so a batch cannot hang on it.
    if (resolve) log("createResultAsync: unknown cellType:", cellType);
    complete(true);
    return;
  }
  const shouldShowResult = shouldShowInlineResult(globalOutputStore, cellType, showResult);
  const outputStore = inline
    ? pendingResult ||
      (hasCode && cellType === "code"
        ? createPendingResult(
            { editor, kernel, markers },
            { row, cellType, showResult: shouldShowResult, globalOutputStore },
          )
        : new ResultView(markers, editor, row, shouldShowResult).outputStore)
    : null;

  if (!hasCode || cellType === "markdown") {
    if (hasCode) {
      const markdown = convertMarkdownToOutput(code);
      if (globalOutputStore) {
        globalOutputStore.startNewRun();
        globalOutputStore.appendOutput(markdown);
      } else {
        outputStore?.appendOutput(markdown);
      }
    }
    outputStore?.appendOutput({ data: "ok", stream: "status" });
    complete(true);
    return;
  }

  if (globalOutputStore) {
    globalOutputStore.setLastCode(code);
    // clear_output clears this execution while prior dock runs remain.
    globalOutputStore.startNewRun();
  }
  kernel.setLastOutputStore(globalOutputStore || outputStore);
  const session = kernel.getPluginWrapper();
  const rememberTraceback = captureExecution(editor, session, code, row);
  let deliveryFailed = false;
  const deliver = (callback) => (result) => {
    try {
      callback(result);
    } catch (error) {
      if (!deliveryFailed) {
        deliveryFailed = true;
        lumine.notifications.addError("Failed to process kernel output", {
          description: error.message || String(error),
          dismissable: true,
        });
      }
    }
  };
  const recipients = [
    ...(onResult ? [deliver(onResult)] : []),
    ...(outputStore ? [deliver((result) => outputStore.appendOutput(result))] : []),
    ...(globalOutputStore ? [deliver((result) => globalOutputStore.appendOutput(result))] : []),
  ];
  const request = session.request({
    type: "execute",
    purpose: "user",
    code,
    signal,
    collectOutputs: false,
  });
  let lastCount = null;
  let receivedError = false;
  const outputSubscription = request.onDidOutput((result) => {
    if (result.output_type === "error") receivedError = true;
    rememberTraceback(result);
    for (const receive of recipients) receive(result);
  });
  const stateSubscription = request.onDidChange(({ executionCount }) => {
    if (executionCount == null || executionCount === lastCount) return;
    lastCount = executionCount;
    const count = { stream: "execution_count", data: executionCount };
    rememberTraceback(count);
    for (const receive of recipients) receive(count);
  });
  const editorSubscription = editor?.onDidDestroy?.(() => request.dispose());
  void request.done.then((outcome) => {
    outputSubscription.dispose();
    stateSubscription.dispose();
    editorSubscription?.dispose();
    if (!editor?.isDestroyed?.()) {
      if (outcome.error && !receivedError && outcome.status !== "cancelled") {
        const error = { output_type: "error", ...outcome.error };
        rememberTraceback(error);
        for (const receive of recipients) receive(error);
      }
      const terminal = { stream: "status", data: outcome.status === "ok" ? "ok" : "error" };
      for (const receive of recipients) receive(terminal);
    }
    complete(outcome.status === "ok" && !deliveryFailed, outcome.durationMs ?? null, {
      ...outcome,
      requestId: request.id,
      generation: request.generation,
      ...(deliveryFailed && outcome.status === "ok"
        ? {
            status: "error",
            error: {
              ename: "OutputDeliveryFailed",
              evalue: "An output recipient failed.",
              traceback: [],
            },
          }
        : {}),
    });
  });
}

// Code submitted without a source editor still goes through the same result
// pipeline and kernel-owned output log that the dock displays for human runs.
function createKernelResultAsync(kernel, code, onResult, { signal } = {}) {
  return createResultAsync(
    { editor: null, kernel, markers: null },
    {
      code,
      row: 0,
      cellType: "code",
      inline: false,
      dock: true,
      onResult,
      signal,
    },
  );
}

module.exports = {
  createPendingResult,
  createResult,
  importResult,
  clearResult,
  clearResults,
  convertMarkdownToOutput,
  createResultAsync,
  createKernelResultAsync,
  createResultBatch,
};
