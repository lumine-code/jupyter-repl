const { CompositeDisposable, Disposable } = require("lumine");
const OutputStore = require("../../store/output");
const ResultViewComponent = require("./result-view");

class ResultView {
  destroyed = false;

  destroy = () => {
    if (this.destroyed) return;
    this.destroyed = true;

    const editor = this.editor;

    if (editor != null) {
      editor.element.focus();
    }

    this.resizeObserver?.disconnect();
    this.disposer.dispose();
    if (this.decoration) {
      this.decoration.destroy();
    }
    this.marker.destroy();
  };

  constructor(markerStore, kernel, editor, row, showResult = true) {
    const element = document.createElement("div");
    element.classList.add("jupyter-repl", "marker");
    this.disposer = new CompositeDisposable();
    this.editor = editor;
    markerStore.clearOnRow(row);
    this.marker = editor.markBufferPosition([row, Infinity], {
      invalidate: "touch",
    });
    this.outputStore = new OutputStore();
    this.outputStore.updatePosition({
      lineLength:
        editor.screenPositionForBufferPosition([row, Infinity]).column *
        editor.getDefaultCharWidth(),
      lineHeight: editor.getLineHeightInPixels(),
      editorWidth: editor.element.getWidth(),
      charWidth: editor.getDefaultCharWidth(),
    });
    this.decoration = editor.decorateMarker(this.marker, {
      type: "block",
      item: element,
      position: "after",
    });
    this.marker.onDidChange((event) => {
      if (this.destroyed) return;
      if (!event.isValid) {
        markerStore.delete(this.marker.id);
      } else {
        if (editor.isDestroyed?.() || !editor.element) return;
        this.outputStore.updatePosition({
          lineLength:
            editor.screenPositionForBufferPosition(this.marker.getStartBufferPosition()).column *
            editor.getDefaultCharWidth(),
          lineHeight: editor.getLineHeightInPixels(),
          editorWidth: editor.element.getWidth(),
          charWidth: editor.getDefaultCharWidth(),
        });
      }
    });
    markerStore.new(this);

    this.component = new ResultViewComponent({
      store: this.outputStore,
      kernel,
      editor,
      destroy: this.destroy,
      showResult,
    });
    element.appendChild(this.component.element);
    this.disposer.add(new Disposable(() => this.component.destroy()));

    // Observe element resize to trigger editor layout update
    this.resizeObserver = new ResizeObserver(() => {
      if (this.destroyed) return;
      editor.component?.scheduleUpdate();
      editor.decorationManager.emitter.emit("did-update-decorations");
    });
    this.resizeObserver.observe(element);
  }
}

module.exports = ResultView;
