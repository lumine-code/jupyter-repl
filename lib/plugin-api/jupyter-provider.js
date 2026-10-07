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
   * @param {Object} [services] - Accessors for this runtime's registry and adapters.
   */
  constructor(emitter, services = {}) {
    this._emitter = emitter;
    this._getStore = services.getStore || (() => require("../store"));
    this._getAdapterServices = services.getAdapterServices || (() => []);
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
    const subscription = this.onDidChangeKernel(callback);
    try {
      callback(this.getActiveKernel());
    } catch (error) {
      subscription.dispose();
      throw error;
    }
    return subscription;
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

  getKernelForEditor(editor) {
    if (!editor || editor.isDestroyed?.()) return null;
    const element = editor.element || editor.getElement?.();
    if (element)
      for (const item of lumine.workspace.getPaneItems()) {
        if (item === editor) continue;
        const root = item.getElement?.() || item.element;
        if (root?.contains?.(element)) return this.getKernelForItem(item);
      }
    const kernel = require("../execution-context").kernelForEditor(editor, this._getStore());
    return kernel?.getPluginWrapper() || null;
  }

  getKernelForItem(item) {
    if (!item || item.isDestroyed?.()) return null;
    for (const service of this._getAdapterServices()) {
      const adapter = service.getAdapterForItem?.(item);
      if (adapter)
        return (
          require("../adapter-integration").getKernelForAdapter(adapter)?.getPluginWrapper() || null
        );
    }
    if (typeof item.getJupyterKernel === "function") return item.getJupyterKernel();
    return this.getKernelForEditor(typeof item.getGrammar === "function" ? item : null);
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
