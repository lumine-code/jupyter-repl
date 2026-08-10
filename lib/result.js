const ResultView = require("./components/result-view");
const OutputPane = require("./panes/output-area");
const { OUTPUT_TYPES } = require("./output-utils");
const { OUTPUT_AREA_URI, openOrShowDock, log } = require("./utils");

const RESULT_ITEM_CHANGE_DELAY_MS = 10;

function shouldFlushResultItem(message) {
  return (
    OUTPUT_TYPES.includes(message?.output_type) ||
    message?.stream === "status" ||
    message?.stream === "error"
  );
}

function getGlobalOutputStore(kernel, inline = true) {
  if (!inline) {
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
  if (!editor || !kernel || !markers) {
    return null;
  }
  if (globalOutputStore === undefined) {
    globalOutputStore = getGlobalOutputStore(kernel);
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
  if (!editor || !kernel || !markers || codeBlocks.length === 0) {
    return true;
  }

  // One batch per kernel at a time. A held run-all keybinding repeats faster
  // than any batch finishes, and each repeat would queue every cell again —
  // hundreds of duplicate executions that fill the socket's high-water mark
  // and wedge the connection. A batch asked for while one is running is the
  // same request already being served; drop it.
  if (kernel.batchInFlight) {
    log("createResultBatch: batch already running on this kernel, dropped");
    return true;
  }
  kernel.batchInFlight = true;

  try {
    const executionContext = { editor, kernel, markers };
    // The dock cannot open or close while the batch runs, so resolve it once
    // instead of walking every pane item twice per cell.
    const globalOutputStore = getGlobalOutputStore(kernel);
    const pendingResults = codeBlocks.map((codeBlock) =>
      createPendingResult(executionContext, { ...codeBlock, globalOutputStore }),
    );

    for (let index = 0; index < codeBlocks.length; index++) {
      const codeBlock = codeBlocks[index];
      const { success } = await createResultAsync(executionContext, {
        ...codeBlock,
        globalOutputStore,
        pendingResult: pendingResults[index],
      });
      if (!success) {
        // Later blocks will not execute after a failure. Reuse the existing
        // error status so each remaining queued bubble becomes an X.
        for (const pendingResult of pendingResults.slice(index + 1)) {
          pendingResult?.appendOutput({
            data: "error",
            stream: "status",
          });
        }
        return false;
      }
    }
    return true;
  } finally {
    kernel.batchInFlight = false;
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
function createResult({ editor, kernel, markers }, { code, row, cellType }) {
  if (!editor || !kernel || !markers) {
    return;
  }
  editor.terminatePendingState();

  const globalOutputStore = getGlobalOutputStore(kernel);
  if (globalOutputStore) {
    openOrShowDock(OUTPUT_AREA_URI);
  }
  if (code.search(/\S/) !== -1) {
    switch (cellType) {
      case "markdown": {
        const { outputStore } = new ResultView(
          markers,
          editor,
          row,
          !globalOutputStore || cellType === "markdown",
        );
        if (globalOutputStore) {
          globalOutputStore.startNewRun();
          globalOutputStore.appendOutput(convertMarkdownToOutput(code));
        } else {
          outputStore.appendOutput(convertMarkdownToOutput(code));
        }
        outputStore.appendOutput({
          data: "ok",
          stream: "status",
        });
        break;
      }

      case "codecell": {
        const outputStore = createPendingResult(
          { editor, kernel, markers },
          {
            row,
            cellType,
            showResult: !globalOutputStore || cellType === "markdown",
          },
        );
        if (globalOutputStore) {
          globalOutputStore.setLastCode(code);
          // Start a new entry per execution so the output-area log keeps prior
          // runs and clear_output only clears the current execution.
          globalOutputStore.startNewRun();
        }
        kernel.setLastOutputStore(globalOutputStore || outputStore);
        kernel.execute(code, (result) => {
          outputStore.appendOutput(result);
          if (globalOutputStore) {
            globalOutputStore.appendOutput(result);
          }
        });
        break;
      }
    }
  } else {
    const { outputStore } = new ResultView(
      markers,
      editor,
      row,
      !globalOutputStore || cellType === "markdown",
    );
    outputStore.appendOutput({
      data: "ok",
      stream: "status",
    });
  }
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
function createResultAsync(
  { editor, kernel, markers },
  {
    code,
    row,
    cellType,
    onResult,
    showResult = null,
    inline = true,
    pendingResult = null,
    globalOutputStore,
  },
) {
  return new Promise((resolve) => {
    if (!editor || !kernel || (inline && !markers)) {
      resolve({ success: true, durationMs: null });
      return;
    }

    if (globalOutputStore === undefined) {
      globalOutputStore = getGlobalOutputStore(kernel, inline);
    } else if (!inline) {
      globalOutputStore = null;
    }
    if (inline && globalOutputStore) {
      openOrShowDock(OUTPUT_AREA_URI);
    }
    const shouldShowResult = shouldShowInlineResult(globalOutputStore, cellType, showResult);

    if (code.search(/\S/) !== -1) {
      switch (cellType) {
        case "markdown": {
          const outputStore = inline
            ? pendingResult || new ResultView(markers, editor, row, shouldShowResult).outputStore
            : null;
          if (globalOutputStore) {
            globalOutputStore.startNewRun();
            globalOutputStore.appendOutput(convertMarkdownToOutput(code));
          } else if (outputStore) {
            outputStore.appendOutput(convertMarkdownToOutput(code));
          }
          outputStore?.appendOutput({
            data: "ok",
            stream: "status",
          });
          resolve({ success: true, durationMs: null });
          break;
        }

        case "codecell": {
          const outputStore = inline
            ? pendingResult ||
              createPendingResult(
                { editor, kernel, markers },
                { row, cellType, showResult: shouldShowResult, globalOutputStore },
              )
            : null;
          let shellStatus = null;
          let kernelIdle = false;
          // Assigned right below; declared first because a kernel may deliver
          // results synchronously from within execute().
          let entry = null;

          const tryResolve = () => {
            // Only resolve when we have both shell reply AND kernel is idle
            if (shellStatus !== null && kernelIdle) {
              resolve({ success: shellStatus === "ok", durationMs: entry?.durationMs ?? null });
            }
          };

          if (globalOutputStore) {
            globalOutputStore.setLastCode(code);
            // Start a new entry per execution so the output-area log keeps prior
            // runs and clear_output only clears the current execution.
            globalOutputStore.startNewRun();
          }
          kernel.setLastOutputStore(globalOutputStore || outputStore);
          entry = kernel.execute(code, (result) => {
            if (onResult) {
              onResult(result);
            }
            outputStore?.appendOutput(result);
            if (globalOutputStore) {
              globalOutputStore.appendOutput(result);
            }
            // Shell reply with execution status
            if (result.stream === "status" && shellStatus === null) {
              shellStatus = result.data;
              tryResolve();
            }
            // iopub status message indicating kernel is idle
            if (result.output_type === "status" && result.execution_state === "idle") {
              kernelIdle = true;
              tryResolve();
            }
          });
          break;
        }

        default: {
          // An unrecognised cell type must still settle the promise, or a
          // batch would hang on it forever.
          log("createResultAsync: unknown cellType:", cellType);
          resolve({ success: true, durationMs: null });
        }
      }
    } else {
      const outputStore = inline
        ? pendingResult || new ResultView(markers, editor, row, shouldShowResult).outputStore
        : null;
      outputStore?.appendOutput({
        data: "ok",
        stream: "status",
      });
      resolve({ success: true, durationMs: null });
    }
  });
}

module.exports = {
  createPendingResult,
  createResult,
  importResult,
  clearResult,
  clearResults,
  convertMarkdownToOutput,
  createResultAsync,
  createResultBatch,
};
