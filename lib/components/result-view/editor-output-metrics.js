const { CompositeDisposable, Disposable } = require("lumine");

const sources = new WeakMap();

function readEditorOutputMetrics(editor) {
  return {
    editorWidth: editor.element.getWidth(),
    lineHeight: editor.getLineHeightInPixels(),
    charWidth: editor.getDefaultCharWidth(),
  };
}

class EditorOutputMetrics {
  callbacks = new Set();
  destroyed = false;
  scheduled = false;

  constructor(editor) {
    this.editor = editor;
    this.metrics = readEditorOutputMetrics(editor);
    this.disposables = new CompositeDisposable();
    this.bindObserver();
    for (const key of ["editor.fontSize", "editor.fontFamily", "editor.lineHeight"]) {
      this.disposables.add(lumine.config.onDidChange(key, () => this.schedule()));
    }
    for (const method of [
      "onDidAddStyleElement",
      "onDidRemoveStyleElement",
      "onDidUpdateStyleElement",
    ]) {
      if (lumine.styles?.[method])
        this.disposables.add(lumine.styles[method](() => this.schedule()));
    }
    if (editor.onDidDestroy) this.disposables.add(editor.onDidDestroy(() => this.destroy()));
    if (editor.element.onDidAttach)
      this.disposables.add(
        editor.element.onDidAttach(() => {
          this.bindObserver();
          this.schedule();
        }),
      );
    if (editor.element.onDidDetach)
      this.disposables.add(editor.element.onDidDetach(() => this.releaseObserver()));
  }

  bindObserver() {
    if (this.destroyed) return;
    this.releaseObserver();
    const element = this.editor.element;
    const window = element.ownerDocument.defaultView;
    const observer = new window.ResizeObserver(() => {
      if (this.observer === observer) this.schedule();
    });
    this.observer = observer;
    observer.observe(element);
    // Gutter and minimap changes can resize the text viewport independently.
    const viewport = element.querySelector?.(".scroll-view");
    if (viewport) observer.observe(viewport);
  }

  releaseObserver() {
    this.observer?.disconnect();
    this.observer = null;
  }

  schedule() {
    if (this.destroyed || this.scheduled) return;
    this.scheduled = true;
    // Core measures font and viewport changes in its document update. Read
    // afterwards, once per editor, rather than one stale width per bubble.
    lumine.views.readDocument(() => {
      this.scheduled = false;
      if (this.destroyed || this.editor.isDestroyed?.()) return;
      const metrics = readEditorOutputMetrics(this.editor);
      if (Object.keys(metrics).every((key) => metrics[key] === this.metrics[key])) return;
      this.metrics = metrics;
      for (const callback of [...this.callbacks]) {
        if (this.destroyed) break;
        if (this.callbacks.has(callback)) callback(metrics);
      }
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.releaseObserver();
    this.disposables.dispose();
    this.callbacks.clear();
    if (sources.get(this.editor) === this) sources.delete(this.editor);
    this.editor = null;
  }
}

function observeEditorOutputMetrics(editor, callback) {
  let source = sources.get(editor);
  if (!source || source.destroyed) {
    source = new EditorOutputMetrics(editor);
    sources.set(editor, source);
  }
  source.callbacks.add(callback);
  return new Disposable(() => {
    source.callbacks.delete(callback);
    if (source.callbacks.size === 0) source.destroy();
  });
}

module.exports = { observeEditorOutputMetrics, readEditorOutputMetrics };
