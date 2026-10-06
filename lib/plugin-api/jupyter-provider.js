const { Disposable } = require("lumine");

/**
 * The `jupyter.kernel` service: everything another package needs to follow this
 * one's kernels without reaching into its internals.
 *
 * Kernels are handed out as their plugin wrappers, never as the internal
 * objects, so the surface a consumer sees is the one documented in
 * `docs/jupyter.kernel.md`.
 *
 * @class JupyterProvider
 */
class JupyterProvider {
  /**
   * @param {Emitter} emitter
   * @param {Object|Function} [services] - Accessors for the store, cells and
   *   adapters owned by this package generation. A function retains the older
   *   two-argument constructor's getAdapterServices meaning.
   */
  constructor(emitter, services = {}) {
    const options = typeof services === "function" ? { getAdapterServices: services } : services;
    this._emitter = emitter;
    this._getStore = options.getStore || (() => require("../store"));
    this._getCellsService =
      options.getCellsService || (() => require("../code-manager-state").getCellsService());
    this._getAdapterServices = options.getAdapterServices || (() => []);
  }

  /**
   * Invoke the callback when the kernel of the active editor changes, including
   * to `null`. Does not replay: read `getActiveKernel()` for the current value.
   *
   * @param {Function} callback - Called with the kernel, or null
   * @returns {Disposable}
   */
  onDidChangeKernel(callback) {
    return this._emitter.on("did-change-kernel", (kernel) => {
      callback(kernel ? kernel.getPluginWrapper() : null);
    });
  }

  /**
   * Invoke the callback with the kernel of the active editor now, and again
   * whenever it changes, including to `null`. The observe flavour of
   * `onDidChangeKernel`, for a consumer that renders the current state and
   * must not depend on subscription order to see it.
   *
   * @param {Function} callback - Called with the kernel, or null
   * @returns {Disposable}
   */
  observeActiveKernel(callback) {
    callback(this.getActiveKernel());
    return this.onDidChangeKernel(callback);
  }

  /**
   * Invoke the callback whenever a kernel starts running.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidAddKernel(callback) {
    return this._getStore().onDidAddKernel((kernel) => callback(kernel.getPluginWrapper()));
  }

  /**
   * Invoke the callback whenever a running kernel goes away.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidRemoveKernel(callback) {
    return this._getStore().onDidRemoveKernel((kernel) => callback(kernel.getPluginWrapper()));
  }

  /**
   * Invoke the callback whenever the set of running kernels changes, or the
   * files any of them is bound to. For consumers that render the whole list.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidChangeKernels(callback) {
    return this._getStore().onDidChangeKernels(callback);
  }

  /**
   * The kernel of the active editor, or `null` when none is running.
   *
   * This used to throw instead, which contradicted both the documented shape
   * and every reasonable consumer: "is there a kernel yet" is the first thing
   * a panel asks, and the answer is routinely no.
   *
   * @returns {JupyterKernel|null}
   */
  getActiveKernel() {
    const kernel = this._getStore().kernel;
    return kernel ? kernel.getPluginWrapper() : null;
  }

  /**
   * Every kernel running in this window, in the order they started.
   * @returns {JupyterKernel[]}
   */
  getRunningKernels() {
    return this._getStore().runningKernels.map((kernel) => kernel.getPluginWrapper());
  }

  /**
   * The files a kernel is bound to. A kernel can serve several, and an unsaved
   * editor appears as `Unsaved Editor <id>` rather than a path.
   *
   * @param {JupyterKernel} kernel
   * @returns {String[]}
   */
  getFilesForKernel(kernel) {
    const store = this._getStore();
    const internal = store.runningKernels.find(
      (candidate) => candidate.getPluginWrapper() === kernel,
    );
    return internal ? store.getFilesForKernel(internal) : [];
  }

  /**
   * The `Range` that `jupyter-cells:run-cell` would run, or `null` with no
   * active text editor — and also `null` without the jupyter-cells package,
   * which owns the cell model this answers from.
   * @returns {Range|null}
   */
  getCellRange() {
    const store = this._getStore();
    if (!store.editor) {
      return null;
    }
    const cells = this._getCellsService();
    return cells ? cells.getCurrentCell(store.editor) : null;
  }

  /**
   * The editor a code-reading command should act on.
   *
   * The focused element comes first, so this finds the embedded editors a
   * notebook renders for its cells — they are not the active pane item, so
   * `getActiveTextEditor()` does not return them. When focus has moved away
   * entirely (a command run from the menu) an adapter still knows which of its
   * cells is current, which the workspace does not.
   *
   * @returns {TextEditor|null}
   */
  getFocusedEditor() {
    const focused = lumine.workspace.getFocusedTextEditor({ includeMini: false });
    if (focused) return focused;
    const adapterEditor = require("../adapter-integration").getAdapterFocusedEditor(
      this._getAdapterServices(),
    );
    return adapterEditor || lumine.workspace.getActiveTextEditor() || null;
  }

  /**
   * The expression under the cursor, as this package parses one: a name, a
   * dotted path, a subscript, or a call — whichever the cursor sits in.
   * Answers `""` when there is nothing to read.
   *
   * A panel that inspects or explores "what is under the cursor" needs the same
   * answer the REPL itself would give, which is why it comes from here rather
   * than each panel parsing the buffer again.
   *
   * @param {TextEditor} [editor] - Defaults to the focused editor
   * @returns {String}
   */
  getExpressionAtCursor(editor = this.getFocusedEditor()) {
    return editor ? require("../source-analysis/expressions").getExpressionAtCursor(editor) : "";
  }

  /**
   * Shut down and release every running kernel. Offered for a consumer that
   * owns the window's lifecycle; a panel should not call it.
   * @returns {Disposable} No-op, so callers can compose it
   */
  shutdownAllKernels() {
    for (const kernel of this._getStore().runningKernels.slice()) {
      kernel.shutdownAndDestroy();
    }
    return new Disposable();
  }
}

module.exports = JupyterProvider;
