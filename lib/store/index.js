const { CompositeDisposable, Emitter, watchFile } = require("lumine");
const MarkerStore = require("./markers");
const KernelRegistry = require("./kernel-registry");

// Keep the store module independent of the package's broad utility bundle at
// bootstrap. Most utility calls happen only after an editor or kernel exists;
// resolving them on first use keeps config/output helpers out of activation.
const utils = new Proxy(
  {},
  {
    get(_target, property) {
      return require("../utils")[property];
    },
  },
);

let Kernel = null;
const getKernel = () => (Kernel ||= require("../kernel"));

class Store {
  subscriptions = new CompositeDisposable();
  // Event layer for non-mobx consumers. Lives for the process lifetime, like
  // the store singleton itself, so it is deliberately not part of dispose().
  emitter = new Emitter();
  markersMapping = new Map();
  _kernelRegistry = new KernelRegistry({
    isKernel: (value) => value instanceof getKernel(),
    didAdd: (kernel) => this.emitter.emit("did-add-kernel", kernel),
    didRemove: (kernel) => this.emitter.emit("did-remove-kernel", kernel),
    didChange: () => this._emitKernelsChanged(),
    bindFile: (editor, filePath) => this.addFileDisposer(editor, filePath),
    releaseFile: (filePath) => this.disposeFileDisposer(filePath),
    remapFile: (oldKey, newKey) => this._remapFileDisposer(oldKey, newKey),
    releaseReferences: (removed) => this._releaseKernelReferences(removed),
    remapReferences: (oldKey, newKey) => this._remapKernelReferences(oldKey, newKey),
  });
  fileDisposers = new Map();
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

  // Keep the writable collections shared by service consumers and the owner.
  get runningKernels() {
    return this._kernelRegistry.runningKernels;
  }

  set runningKernels(kernels) {
    this._kernelRegistry.runningKernels = kernels;
  }

  get kernelMapping() {
    return this._kernelRegistry.kernelMapping;
  }

  set kernelMapping(mapping) {
    this._kernelRegistry.kernelMapping = mapping;
  }

  get startingKernels() {
    return this._kernelRegistry.startingKernels;
  }

  set startingKernels(starting) {
    this._kernelRegistry.startingKernels = starting;
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
    // No known process and no provisional binding means there is nothing to
    // resolve. In particular, completion requests must not read pane hooks or
    // parse language mappings for an editor with no kernel.
    if (this.runningKernels.length === 0 && this.kernelMapping.size === 0) return null;
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
      const currentLanguage = utils.grammarToLanguage(this.grammar);
      return this.runningKernels.find(
        (k) => utils.grammarToLanguage(k.grammar) === currentLanguage,
      );
    }

    const file = this.filePath;
    if (!file) {
      return null;
    }
    const kernelOrMap = this.kernelMapping.get(file);
    if (!kernelOrMap) {
      return null;
    }
    if (kernelOrMap instanceof getKernel()) {
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
    return this._kernelRegistry.filePaths;
  }

  get markers() {
    const editor = this.editor;
    if (!editor) {
      return null;
    }
    const markerStore = this.markersMapping.get(editor.id);
    return markerStore ? markerStore : this.newMarkerStore(editor.id, editor);
  }

  newMarkerStore(editorId, editor = null) {
    const markerStore = new MarkerStore();
    this.markersMapping.set(editorId, markerStore);
    if (editor?.onDidDestroy) {
      const subscription = editor.onDidDestroy(() => {
        markerStore.clear();
        if (this.markersMapping.get(editorId) === markerStore) {
          this.markersMapping.delete(editorId);
        }
        this.subscriptions.remove(subscription);
        subscription.dispose();
      });
      this.subscriptions.add(subscription);
    }
    return markerStore;
  }

  startKernel(kernelDisplayName) {
    return this._kernelRegistry.startKernel(kernelDisplayName);
  }

  addFileDisposer(editor, filePath) {
    if (this.fileDisposers.has(filePath)) return;
    const fileDisposer = new CompositeDisposable();
    fileDisposer.editor = editor;
    this.fileDisposers.set(filePath, fileDisposer);

    if (utils.isUnsavedFilePath(filePath)) {
      fileDisposer.add(
        editor.onDidSave((event) => {
          this.remapKernelKey(filePath, event.path);
          this.disposeFileDisposer(filePath);
          this.addFileDisposer(editor, event.path);
        }),
      );
      fileDisposer.add(
        editor.onDidDestroy(() => {
          this.removeKernelKey(filePath);
        }),
      );
    } else {
      const file = watchFile(filePath);
      const dropMapping = () => {
        this.removeKernelKey(filePath);
      };
      const reconcile = () => {
        if (!fileDisposer.disposed && !require("fs").existsSync(filePath)) dropMapping();
      };
      fileDisposer.add(
        file,
        file.onDidChange((events) => {
          if (events.some((event) => event.action === "deleted")) reconcile();
        }),
        file.onDidInvalidate(reconcile),
        file.onDidError((error) => console.error("Unable to watch kernel mapping", error)),
      );
      file.ready.then(reconcile, () => {});
    }

    this.subscriptions.add(fileDisposer);
  }

  disposeFileDisposer(filePath) {
    const disposer = this.fileDisposers.get(filePath);
    if (!disposer) return;
    this.fileDisposers.delete(filePath);
    this.subscriptions.remove(disposer);
    disposer.dispose();
  }

  newKernel(kernel, filePath, editor, grammar) {
    const multilanguage = utils.isMultilanguageGrammar(editor.getGrammar());
    return this._kernelRegistry.register(
      kernel,
      filePath,
      multilanguage ? grammar.name : null,
      multilanguage,
      editor,
    );
  }

  prepareNotebookKernel(kernel, filePath) {
    return this._kernelRegistry.prepareNotebookKernel(kernel, filePath);
  }

  commitNotebookKernel(registration) {
    return this._kernelRegistry.commitNotebookKernel(registration);
  }

  rollbackNotebookKernel(registration) {
    return this._kernelRegistry.rollbackNotebookKernel(registration);
  }

  removeKernelKey(filePath) {
    return this._kernelRegistry.removeKernelKey(filePath);
  }

  remapKernelKey(oldKey, newKey) {
    return this._kernelRegistry.remapKernelKey(oldKey, newKey);
  }

  deleteKernel(kernel) {
    return this._kernelRegistry.deleteKernel(kernel);
  }

  getFilesForKernel(kernel) {
    return this._kernelRegistry.getFilesForKernel(kernel);
  }

  _remapFileDisposer(oldKey, newKey) {
    const editor = this.fileDisposers.get(oldKey)?.editor;
    if (this.fileDisposers.has(oldKey)) {
      this.disposeFileDisposer(oldKey);
      this.addFileDisposer(editor, newKey);
    }
  }

  _releaseKernelReferences({ kernel, filePath }) {
    const changed = kernel
      ? this._externalKernel === kernel
      : this._externalKernelContext?.filePath === filePath;
    if (changed) {
      this._externalKernel = null;
      this._externalKernelContext = null;
    }
    return changed;
  }

  _remapKernelReferences(oldKey, newKey) {
    if (this._externalKernelContext?.filePath === oldKey) {
      this._externalKernelContext = {
        ...this._externalKernelContext,
        filePath: newKey,
      };
    }
  }

  dispose() {
    this._activeItemKernelSubscription?.dispose();
    this._activeItemKernelSubscription = null;
    this.subscriptions.dispose();
    // The store outlives deactivation, and `CompositeDisposable#add` is a
    // silent no-op once disposed — without a fresh one every subscription
    // taken after a reactivation (or a hot reload) would be dropped and
    // never released.
    this.subscriptions = new CompositeDisposable();
    this.fileDisposers.clear();
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
    this._kernelRegistry.clear();
    this._externalKernel = null;
    this._externalKernelContext = null;
    this._lastEmittedKernel = null;
    this.editor = null;
    this.grammar = null;
    this.activePaneItem = null;
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

    if (!utils.isMultilanguageGrammar(grammar)) {
      return grammar;
    }

    const embeddedScope = utils.getEmbeddedScope(editor, editor.getCursorBufferPosition());
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

    if (
      context.owner &&
      (activeItem?.document === context.owner || activeItem?.getKernelOwner?.() === context.owner)
    ) {
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
    if (kernelOrMap instanceof getKernel()) {
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
