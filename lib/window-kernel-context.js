const { CompositeDisposable, Emitter } = require("lumine");
const { kernelForEditor, filePathForEditor } = require("./execution-context");

// A presentation reads the shared kernel registry through its own active item.
// It never changes the session's sticky editor or starts another kernel.
class WindowKernelContext {
  constructor(session, window) {
    this.session = session;
    this.window = window;
    this.container = window.getEditorContainer();
    this.emitter = new Emitter();
    this.subscriptions = new CompositeDisposable();
    this.itemSubscriptions = null;
    this.lastKernel = null;
    const changed = () => this.notifyChanged();
    try {
      this.subscriptions.add(this.container.observeActivePaneItem(() => this.bindItem()));
      this.subscriptions.add(this.container.observeActiveEmbeddedTextEditor(() => this.bindItem()));
      this.subscriptions.add(session.onDidChangeKernels(changed));
      this.subscriptions.add(session.onDidChangeCurrentKernel(changed));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get editor() {
    return this.container.getActiveEmbeddedTextEditor();
  }

  get grammar() {
    return this.editor ? this.session.getEmbeddedGrammar(this.editor) : null;
  }

  get filePath() {
    return filePathForEditor(this.editor);
  }

  get markers() {
    const editor = this.editor;
    if (!editor) return null;
    return (
      this.session.markersMapping.get(editor.id) ?? this.session.newMarkerStore(editor.id, editor)
    );
  }

  get kernel() {
    const item = this.container.getActivePaneItem();
    if (typeof item?.getJupyterKernel === "function") {
      const kernel = item.getJupyterKernel();
      return this.session.runningKernels.includes(kernel) ? kernel : null;
    }
    if (this.editor) return kernelForEditor(this.editor, this.session);
    const path = item?.getPath?.();
    const mapping = path ? this.session.kernelMapping.get(path) : null;
    return mapping instanceof Map
      ? mapping.size === 1
        ? [...mapping.values()][0]
        : null
      : mapping;
  }

  bindItem() {
    this.itemSubscriptions?.dispose();
    this.itemSubscriptions = new CompositeDisposable();
    const changed = () => this.notifyChanged();
    const item = this.container.getActivePaneItem();
    const editor = this.editor;
    for (const subscription of [
      item?.onDidChangeJupyterKernel?.(changed),
      item?.onDidChangePath?.(changed),
      editor?.onDidChangeGrammar?.(changed),
      editor?.onDidDestroy?.(changed),
    ])
      if (subscription) this.itemSubscriptions.add(subscription);
    this.notifyChanged();
  }

  notifyChanged() {
    const kernel = this.kernel ?? null;
    if (kernel === this.lastKernel) return;
    this.lastKernel = kernel;
    this.emitter.emit("did-change-current-kernel", kernel);
  }

  onDidChangeCurrentKernel(callback) {
    return this.emitter.on("did-change-current-kernel", callback);
  }

  capture() {
    return {
      kernel: this.kernel,
      editor: this.editor,
      grammar: this.grammar,
      filePath: this.filePath,
      markers: this.markers,
    };
  }

  dispose() {
    this.subscriptions.dispose();
    this.itemSubscriptions?.dispose();
    this.emitter.dispose();
  }
}

module.exports = WindowKernelContext;
