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
    this.observer = new ResizeObserver(() => this.schedule());
    this.observer.observe(editor.element);
    // The editor box can stay still while a minimap or gutter changes the
    // available text width. Observe the viewport whose metrics getWidth reads.
    const viewport = editor.element.querySelector?.(".scroll-view");
    if (viewport) this.observer.observe(viewport);
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
      this.disposables.add(editor.element.onDidAttach(() => this.schedule()));
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
    this.observer.disconnect();
    this.disposables.dispose();
    this.callbacks.clear();
    if (sources.get(this.editor) === this) sources.delete(this.editor);
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
