const { cancelAutocomplete } = require("../../utils");
const { captureEditorContext, filePathForEditor } = require("../../execution-context");

/**
 * The `jupyter.execution` service: the run pipeline behind the cell commands,
 * for packages that compute what to run without owning a kernel. jupyter-cells
 * hands over `{code, row, cellType}` blocks; jupyter-view routes its toolbar
 * through the adapter member. Everything here wraps machinery that lives in
 * this package — kernels, result bubbles, adapter routing — so the consumer
 * never reaches into it.
 *
 * `context` is injected by main.js: `store`, the `kernelManager`, and a
 * `getAdapterServices` accessor for the live jupyter.adapter list.
 */
function provideJupyterExecution(context) {
  const { store, kernelManager, getAdapterServices } = context;

  return {
    /**
     * Route a run through the jupyter.adapter pane that owns the active item.
     * True when an adapter handled it — the caller stops there, which is what
     * keeps one keystroke working in a notebook pane and a text editor alike.
     * @param {"active"|"all"|"above"} scope
     * @param {Boolean} moveDown
     * @returns {Boolean}
     */
    runAdapter(scope, moveDown = false) {
      return require("../../adapter-integration").runAdapterTargets(
        getAdapterServices(),
        kernelManager,
        { scope, moveDown },
      );
    },

    /**
     * Run pre-computed code blocks in the editor's kernel, starting one when
     * none is attached yet. One block renders through `createResult`, several
     * through `createResultBatch` (which keeps its single-batch-in-flight
     * guard). Resolves true once the run is handed to the kernel pipeline,
     * false when the context is too incomplete to run — silently, since that
     * absence is on screen.
     * @param {TextEditor} editor
     * @param {Array<{code: string, row: number, cellType: string}>} codeBlocks
     * @returns {Promise<Boolean>}
     */
    async runBlocks(
      editor,
      codeBlocks,
      { autocompleteCancelled = false, executionContext = null } = {},
    ) {
      if (!editor || editor.isDestroyed?.() || !Array.isArray(codeBlocks) || !codeBlocks.length) {
        return false;
      }
      const blocks = codeBlocks.filter(
        (block) => block?.cellType === "code" || block?.cellType === "markdown",
      );
      if (!blocks.length) return true;
      const captured = executionContext || captureEditorContext(store, editor);
      if (
        !captured ||
        captured.editor !== editor ||
        captured.kernel?._destroyed ||
        captured.kernel?.destroyed
      )
        return false;
      if (!autocompleteCancelled) cancelAutocomplete(editor);
      const markers =
        store.markersMapping.get(editor.id) || store.newMarkerStore(editor.id, editor);
      const dispatch = async (kernel, pending = blocks) => {
        if (editor.isDestroyed?.()) return false;
        const result = require("../../result");
        const executionContext = { editor, kernel, markers };
        if (pending.length === 1) {
          result.createResult(executionContext, pending[0]);
          return true;
        }
        return result.createResultBatch(executionContext, pending);
      };
      const firstCode = blocks.findIndex((block) => block.cellType === "code");
      if (firstCode === -1) return dispatch(null);
      const { grammar, filePath, kernel } = captured;
      if (!grammar || !filePath) return false;
      if (kernel) {
        return dispatch(kernel);
      }
      // Starting a kernel prompts the picker, which the user may dismiss; the
      // run is accepted either way, so this resolves without waiting on it.
      if (firstCode > 0) await dispatch(null, blocks.slice(0, firstCode));
      kernelManager.startKernelFor(grammar, editor, filePathForEditor(editor), (newKernel) =>
        dispatch(newKernel, blocks.slice(firstCode)),
      );
      return true;
    },

    /**
     * Move the cursor past a run, honoring this package's scroll-behavior
     * setting — the one piece of cursor choreography the run commands share.
     * @param {TextEditor} editor
     * @param {Number} endRow - The last row of what just ran.
     */
    moveDown(editor, endRow) {
      require("../../code-manager").moveDown(editor, endRow);
    },

    /** Clear the results of the current context, adapter panes included. */
    clearResults() {
      if (require("../../adapter-integration").clearAdapterResults(getAdapterServices())) {
        return;
      }
      require("../../result").clearResults(store);
    },

    /**
     * Restart the current kernel, calling back once it is usable again — or
     * immediately when there is none, so a recalculate degrades to a plain run.
     * @param {Function} [onRestarted]
     */
    restartKernel(onRestarted) {
      if (store.kernel) {
        return store.kernel.restart(onRestarted);
      } else if (onRestarted) {
        onRestarted();
      }
      return Promise.resolve(true);
    },

    /**
     * Render outputs saved in a notebook as an inline result bubble — the
     * import path. The bubble machinery is this package's, so imported results
     * look exactly like freshly computed ones.
     * @param {TextEditor} editor
     * @param {{outputs: Object[], row: number}} bundle
     */
    importOutputs(editor, bundle) {
      const markers =
        store.markersMapping.get(editor.id) || store.newMarkerStore(editor.id, editor);
      require("../../result").importResult({ editor, markers }, bundle);
    },

    /**
     * A markdown source turned into the display-data shape `importOutputs`
     * renders, for a notebook's markdown cells.
     * @param {String|String[]} source
     * @returns {Object}
     */
    markdownToOutput(source) {
      return require("../../result").convertMarkdownToOutput(source);
    },
  };
}

module.exports = { provideJupyterExecution };
