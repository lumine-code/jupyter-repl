const { cancelAutocomplete } = require("../../utils");

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

  // Mirrors the store's own derivation for an editor that need not be the
  // active one: a code-lens click lands on the editor it was rendered in.
  const filePathFor = (editor) => editor.getPath() || `Unsaved Editor ${editor.id}`;

  const kernelFor = (editor, grammar, filePath) => {
    if (editor === store.editor) {
      return store.kernel;
    }
    if (store.globalMode) {
      const { grammarToLanguage } = require("../../utils");
      const language = grammarToLanguage(grammar);
      return store.runningKernels.find((kernel) => grammarToLanguage(kernel.grammar) === language);
    }
    const kernelOrMap = store.kernelMapping.get(filePath);
    if (!kernelOrMap) {
      return null;
    }
    return kernelOrMap instanceof Map ? kernelOrMap.get(grammar?.name) : kernelOrMap;
  };

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
    async runBlocks(editor, codeBlocks) {
      if (!editor || editor.isDestroyed?.() || !Array.isArray(codeBlocks) || !codeBlocks.length) {
        return false;
      }
      const grammar = store.getEmbeddedGrammar(editor);
      const filePath = filePathFor(editor);
      if (!grammar || !filePath) {
        return false;
      }
      cancelAutocomplete(editor);
      const dispatch = async (kernel) => {
        const result = require("../../result");
        const executionContext = { editor, kernel, markers: store.markers };
        if (codeBlocks.length === 1) {
          result.createResult(executionContext, codeBlocks[0]);
          return true;
        }
        return result.createResultBatch(executionContext, codeBlocks);
      };
      const kernel = kernelFor(editor, grammar, filePath);
      if (kernel) {
        return dispatch(kernel);
      }
      // Starting a kernel prompts the picker, which the user may dismiss; the
      // run is accepted either way, so this resolves without waiting on it.
      kernelManager.startKernelFor(grammar, editor, filePath, (newKernel) => dispatch(newKernel));
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
        store.kernel.restart(onRestarted);
      } else if (onRestarted) {
        onRestarted();
      }
    },

    /**
     * Render outputs saved in a notebook as an inline result bubble — the
     * import path. The bubble machinery is this package's, so imported results
     * look exactly like freshly computed ones.
     * @param {TextEditor} editor
     * @param {{outputs: Object[], row: number}} bundle
     */
    importOutputs(editor, bundle) {
      const markers = store.markersMapping.get(editor.id) || store.newMarkerStore(editor.id);
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
