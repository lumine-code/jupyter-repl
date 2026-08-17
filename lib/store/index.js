const { CompositeDisposable, Disposable, Emitter, watchFile } = require("lumine");
const {
  isMultilanguageGrammar,
  getEmbeddedScope,
  isUnsavedFilePath,
  grammarToLanguage,
} = require("../utils");
const MarkerStore = require("./markers");
const Kernel = require("../kernel");

class Store {
  subscriptions = new CompositeDisposable();
  // Event layer for non-mobx consumers. Lives for the process lifetime, like
  // the store singleton itself, so it is deliberately not part of dispose().
  emitter = new Emitter();
  markersMapping = new Map();
  runningKernels = [];
  kernelMapping = new Map();
  startingKernels = new Map();
  editor = lumine.workspace.getActiveTextEditor();
  activePaneItem = lumine.workspace.getCenter().getActivePaneItem();
  grammar;
  globalMode = Boolean(lumine.config.get("jupyter-repl.globalMode"));
  // Allow external packages (like jupyter-view) to set the current kernel directly
  _externalKernel = null;
  _externalKernelContext = null;
  _activeItemKernelSubscription = null;

  constructor() {
    this._lastEmittedKernel = null;
    // The current kernel is derived rather than stored: from the active pane
    // item, the editor, its grammar, the kernel mapping, an external kernel, and
    // any panel that reports one of its own. Every one of those is announced by
    // whoever changes it, and `_notifyKernelChanged` recomputes and compares, so
    // a change that resolves to the same kernel stays silent.
  }

  // Emit only when the derived kernel actually changed. Every mutating method
  // calls this; the comparison is what keeps it from being noisy.
  _notifyKernelChanged() {
    const kernel = this.kernel;
    if (kernel !== this._lastEmittedKernel) {
      this._lastEmittedKernel = kernel;
      this.emitter.emit("did-change-current-kernel", kernel);
    }
  }

  /**
   * Invoke the callback whenever the kernel for the current context (active
   * editor / pane item) changes, including to null. The current value can be
   * read synchronously from `store.kernel`.
   * @param {Function} callback - Called with the new kernel or null
   * @returns {Disposable}
   */
  onDidChangeCurrentKernel(callback) {
    return this.emitter.on("did-change-current-kernel", callback);
  }

  /**
   * Invoke the callback whenever a kernel starts running.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidAddKernel(callback) {
    return this.emitter.on("did-add-kernel", callback);
  }

  /**
   * Invoke the callback whenever a running kernel is removed.
   * @param {Function} callback - Called with the kernel
   * @returns {Disposable}
   */
  onDidRemoveKernel(callback) {
    return this.emitter.on("did-remove-kernel", callback);
  }

  /**
   * Invoke the callback whenever the set of running kernels changes, or the
   * files any of them is mapped to. Coarser than the add/remove events, for
   * consumers that render the whole table.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidChangeKernels(callback) {
    return this.emitter.on("did-change-kernels", callback);
  }

  _emitKernelsChanged() {
    this.emitter.emit("did-change-kernels");
    // A change to the set, or to which file maps to which kernel, can change
    // which kernel is the current one.
    this._notifyKernelChanged();
  }

  get kernel() {
    // A pane item bound to a kernel of its own reports it, so the status bar
    // (and other consumers) reflect what is on screen rather than the last
    // focused editor's kernel. Asked of the item rather than matched against a
    // list of URIs here: a panel that lives in another package is the only one
    // that knows, and this store must not carry a list of them.
    const declaredKernel = this._kernelOfActivePaneItem();
    if (declaredKernel !== undefined) {
      return declaredKernel;
    }

    // External kernel takes priority (set by jupyter-view or other packages).
    // Honor it only while it is still running and its context matches; a stale
    // reference is cleared in deleteKernel (a computed must stay side-effect free).
    if (
      this._externalKernel &&
      this.runningKernels.includes(this._externalKernel) &&
      this._externalKernelContextMatches()
    ) {
      return this._externalKernel;
    }

    // The status bar (and other consumers) must follow the active center pane
    // item, not the sticky editor reference. The editor is kept sticky when
    // focus moves to a non-editor center item (e.g. a dock) so those docks keep
    // working, but when the active center item is a different document (e.g. a
    // Jupyter notebook handled by an adapter) we must resolve that item's own
    // kernel, never the sticky editor's.
    if (!this._activePaneItemIsTextEditor()) {
      return this._kernelForActiveItemPath();
    }

    if (!this.grammar || !this.editor) {
      return null;
    }

    if (this.globalMode) {
      // Compare kernel languages rather than scope names so dialect grammars
      // (e.g. IPython for .ipy, scope source.python.ipy) share the kernel
      // started for their base language.
      const currentLanguage = grammarToLanguage(this.grammar);
      return this.runningKernels.find((k) => grammarToLanguage(k.grammar) === currentLanguage);
    }

    const file = this.filePath;
    if (!file) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(file);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return this.grammar && this.grammar.name ? kernelOrMap.get(this.grammar.name) : null;
  }

  get filePath() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const savedFilePath = editor.getPath();
    return savedFilePath ? savedFilePath : `Unsaved Editor ${editor.id}`;
  }

  get filePaths() {
    return [...this.kernelMapping.keys()];
  }

  get markers() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const markerStore = this.markersMapping.get(editor.id);
    return markerStore ? markerStore : this.newMarkerStore(editor.id);
  }

  newMarkerStore(editorId) {
    const markerStore = new MarkerStore();
    this.markersMapping.set(editorId, markerStore);
    return markerStore;
  }

  startKernel(kernelDisplayName) {
    this.startingKernels.set(kernelDisplayName, true);
  }

  addFileDisposer(editor, filePath) {
    const fileDisposer = new CompositeDisposable();

    if (isUnsavedFilePath(filePath)) {
      fileDisposer.add(
        editor.onDidSave((event) => {
          fileDisposer.dispose();
          this.addFileDisposer(editor, event.path); // Add another `fileDisposer` once it's saved
        }),
      );
      fileDisposer.add(
        editor.onDidDestroy(() => {
          this.kernelMapping.delete(filePath);
          this._emitKernelsChanged();
          fileDisposer.dispose();
        }),
      );
    } else {
      // Lumine dropped the synchronous `File` path-watcher API (backed by the
      // old `pathwatcher`) in favor of the async `watchFile`, which is served by
      // the `@parcel/watcher` worker. Subscriptions register synchronously, but
      // the underlying watch is armed asynchronously, so we drop the kernel
      // mapping whenever its backing file is deleted (or renamed away) and tear
      // the watcher down with the disposer to avoid leaking OS resources.
      const file = watchFile(filePath);
      const dropMapping = () => {
        this.kernelMapping.delete(filePath);
        this._emitKernelsChanged();
        fileDisposer.dispose();
      };
      fileDisposer.add(file.onDidDelete(dropMapping), new Disposable(() => file.dispose()));
    }

    this.subscriptions.add(fileDisposer);
  }

  newKernel(kernel, filePath, editor, grammar) {
    if (isMultilanguageGrammar(editor.getGrammar())) {
      if (!this.kernelMapping.has(filePath)) {
        this.kernelMapping.set(filePath, new Map());
      }
      const multiLanguageMap = this.kernelMapping.get(filePath);
      if (multiLanguageMap && typeof multiLanguageMap.set === "function") {
        multiLanguageMap.set(grammar.name, kernel);
      }
    } else {
      this.kernelMapping.set(filePath, kernel);
    }

    this.addFileDisposer(editor, filePath);
    const index = this.runningKernels.findIndex((k) => k === kernel);

    if (index === -1) {
      this.runningKernels.push(kernel);
      this.emitter.emit("did-add-kernel", kernel);
    }
    this._emitKernelsChanged();

    // delete startingKernel since store.kernel now in place to prevent duplicate kernel
    this.startingKernels.delete(kernel.kernelSpec.display_name);
  }

  remapKernelKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey || !this.kernelMapping.has(oldKey)) {
      return;
    }

    const existing = this.kernelMapping.get(newKey);
    const incoming = this.kernelMapping.get(oldKey);
    if (existing instanceof Kernel && incoming instanceof Kernel) {
      this.kernelMapping.set(newKey, incoming);
    } else if (existing && typeof existing.set === "function" && incoming) {
      if (incoming instanceof Kernel) {
        existing.set(incoming.grammar.name, incoming);
      } else if (typeof incoming.forEach === "function") {
        incoming.forEach((kernel, grammarName) => existing.set(grammarName, kernel));
      }
    } else {
      this.kernelMapping.set(newKey, incoming);
    }
    this.kernelMapping.delete(oldKey);
    this._emitKernelsChanged();

    if (this._externalKernelContext?.filePath === oldKey) {
      this._externalKernelContext = {
        ...this._externalKernelContext,
        filePath: newKey,
      };
    }
  }

  deleteKernel(kernel) {
    const grammar = kernel.grammar.name;
    const files = this.getFilesForKernel(kernel);
    files.forEach((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return;
      }

      if (kernelOrMap instanceof Kernel) {
        this.kernelMapping.delete(file);
      } else {
        kernelOrMap.delete(grammar);
      }
    });
    const previousCount = this.runningKernels.length;
    this.runningKernels = this.runningKernels.filter((k) => k !== kernel);

    // Drop the external-kernel reference here (in an action) once its kernel is
    // gone, rather than mutating observables inside the `kernel` computed.
    if (this._externalKernel === kernel) {
      this._externalKernel = null;
      this._externalKernelContext = null;
    }

    if (this.runningKernels.length !== previousCount) {
      this.emitter.emit("did-remove-kernel", kernel);
    }
    this._emitKernelsChanged();
  }

  getFilesForKernel(kernel) {
    const grammar = kernel.grammar.name;
    return this.filePaths.filter((file) => {
      const kernelOrMap = this.kernelMapping.get(file);
      if (!kernelOrMap) {
        return false;
      }
      return kernelOrMap instanceof Kernel
        ? kernelOrMap === kernel
        : kernelOrMap.get(grammar) === kernel;
    });
  }

  dispose() {
    this.subscriptions.dispose();
    // The store outlives deactivation, and `CompositeDisposable#add` is a
    // silent no-op once disposed — without a fresh one every subscription
    // taken after a reactivation (or a hot reload) would be dropped and
    // never released.
    this.subscriptions = new CompositeDisposable();
    this.markersMapping.forEach((markerStore) => markerStore.clear());
    this.markersMapping.clear();
    // Destroy kernels with error handling to prevent one failure from blocking others
    this.runningKernels.forEach((kernel) => {
      try {
        kernel.destroy();
      } catch (e) {
        console.error("[jupyter-repl] Error destroying kernel:", e);
      }
    });
    this.runningKernels = [];
    this.kernelMapping.clear();
  }

  updateEditor(editor) {
    this.editor = editor;
    this.setGrammar(editor);

    if (this.globalMode && this.kernel && editor) {
      const fileName = editor.getPath();
      if (fileName) {
        this.kernelMapping.set(fileName, this.kernel);
      }
    }

    this._notifyKernelChanged();
  }

  // Returns the embedded grammar for multilanguage, normal grammar otherwise
  getEmbeddedGrammar(editor) {
    const grammar = editor.getGrammar();

    if (!isMultilanguageGrammar(grammar)) {
      return grammar;
    }

    const embeddedScope = getEmbeddedScope(editor, editor.getCursorBufferPosition());
    if (!embeddedScope) {
      return grammar;
    }
    const scope = embeddedScope.replace(".embedded", "");
    return lumine.grammars.grammarForScopeName(scope);
  }

  setGrammar(editor) {
    this.grammar = editor ? this.getEmbeddedGrammar(editor) : null;
    this._notifyKernelChanged();
  }

  /**
   * Set an external kernel as the current kernel.
   * Used by jupyter-view to make its kernels visible to Variable Explorer, etc.
   * @param {Object|null} kernel - The kernel to set as current, or null to clear
   * @param {Object|null} context - Optional active pane/path context for this kernel
   */
  setExternalKernel(kernel, context = null) {
    this._externalKernel = kernel;
    this._externalKernelContext = context;
    this._notifyKernelChanged();
  }

  updateActivePaneItem(item) {
    this.activePaneItem = item || null;

    // A panel that reports a kernel of its own can change which one while it is
    // the active item, and only it knows when. The subscription follows the
    // active item, so at most one is held at a time.
    this._activeItemKernelSubscription?.dispose();
    this._activeItemKernelSubscription =
      typeof this.activePaneItem?.onDidChangeJupyterKernel === "function"
        ? this.activePaneItem.onDidChangeJupyterKernel(() => this._notifyKernelChanged())
        : null;

    this._notifyKernelChanged();
  }

  /**
   * The kernel the active pane item declares for itself, or `undefined` when it
   * declares none — distinct from a `null` meaning "mine, and there is none".
   *
   * A panel in another package hands out plugin wrappers, so map back to the
   * internal kernel; one this store does not know resolves to null rather than
   * escaping into consumers that expect the internal object.
   */
  _kernelOfActivePaneItem() {
    const activeItem = this.activePaneItem;
    if (!activeItem || typeof activeItem.getJupyterKernel !== "function") {
      return undefined;
    }
    const kernel = activeItem.getJupyterKernel();
    if (!kernel) {
      return null;
    }
    if (this.runningKernels.includes(kernel)) {
      return kernel;
    }
    return (
      this.runningKernels.find((candidate) => candidate.getPluginWrapper?.() === kernel) || null
    );
  }

  _externalKernelContextMatches() {
    const context = this._externalKernelContext;
    if (!context) return true;

    const activeItem = this.activePaneItem;
    if (context.paneItem && activeItem === context.paneItem) {
      return true;
    }

    const activePath = activeItem?.getPath?.();
    if (context.filePath && activePath === context.filePath) {
      return true;
    }

    if (!this._activePaneItemIsEditor()) {
      return false;
    }

    const editorPath = this.editor?.getPath?.();
    return Boolean(context.filePath && editorPath === context.filePath);
  }

  _activePaneItemIsEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && activeItem === this.editor);
  }

  _activePaneItemIsTextEditor() {
    const activeItem = this.activePaneItem;
    return Boolean(activeItem && lumine.workspace.isTextEditor(activeItem));
  }

  // Resolve the kernel mapped to the active center pane item by its path. Used
  // for non-editor center items (e.g. a Jupyter notebook) so the status bar
  // reflects that item's kernel instead of the sticky editor's.
  _kernelForActiveItemPath() {
    const path = this.activePaneItem?.getPath?.();
    if (!path) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(path);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof Kernel) {
      return kernelOrMap;
    }
    return typeof kernelOrMap.values === "function"
      ? kernelOrMap.values().next().value || null
      : null;
  }

  /**
   * Move a kernel mapped to an unsaved editor onto the path it was saved to.
   *
   * `filePath` stands in `Unsaved Editor <id>` for an editor with no path, so
   * saving one strands its kernel under a key nothing will look up again. This
   * used to read `filePath` twice around a no-op editor swap, because as a mobx
   * computed the first read returned the cached (stale) key and the swap forced
   * the second to recompute; without the cache both reads are the new path, so
   * the placeholder is rebuilt from the editor id instead.
   */
  forceEditorUpdate() {
    const editor = this.editor;
    if (!editor) {
      return;
    }
    const newKey = this.filePath;
    const unsavedKey = `Unsaved Editor ${editor.id}`;
    if (!newKey || newKey === unsavedKey || !this.kernelMapping.has(unsavedKey)) {
      return;
    }
    this.remapKernelKey(unsavedKey, newKey);
  }
}
const store = new Store();
window.jupyter_store = store; // For debugging

module.exports = store;
