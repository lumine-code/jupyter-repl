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

  constructor(markerStore, editor, row, showResult = true) {
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

    // The editor records a block decoration's height when the decoration is
    // inserted and, for elements it has on screen, whenever they resize. A
    // bubble filled by a batch is neither: its content streams into a
    // detached element — no ResizeObserver fires there — so the height the
    // editor keeps is the queued icon's, and the document grows bubble by
    // bubble as scrolling reveals them. Mark the content dirty as results
    // arrive, and after the patch that renders them ask the editor to
    // re-measure; it measures detached elements in its off-screen area, so
    // the scrollbar is truthful before the user ever scrolls.
    this._contentDirty = false;
    this.disposer.add(
      this.outputStore.onDidUpdate(() => {
        this._contentDirty = true;
      }),
    );

    this.component = new ResultViewComponent({
      store: this.outputStore,
      editor,
      destroy: this.destroy,
      showResult,
      onContentRendered: () => this.invalidateDecorationDimensions(),
    });
    element.appendChild(this.component.element);
    this.disposer.add(new Disposable(() => this.component.destroy()));

    // The bubble lives in a block decoration the editor attaches and lays out
    // asynchronously, so a resize is also the component's cue to re-measure:
    // the toolbar's expand button and the auto-scroll both read scrollHeight,
    // and a final output that patched before attachment measured a detached
    // element as zero — with no further outputs, nothing else would ever
    // correct it.
    this.resizeObserver = new ResizeObserver(() => this.handleElementResize());
    this.resizeObserver.observe(element);
  }

  handleElementResize() {
    if (this.destroyed) return;
    this.component.update();
    this.editor.component?.scheduleUpdate();
    this.editor.decorationManager.emitter.emit("did-update-decorations");
  }

  /**
   * Ask the editor to re-measure this bubble's decoration, once per content
   * change. Gated on the dirty flag: a measurement pass parks the element in
   * the editor's measuring area, which fires the resize observer and re-runs
   * the render hooks — without the gate that round trip would re-invalidate
   * and measure forever.
   */
  invalidateDecorationDimensions() {
    if (this.destroyed || !this._contentDirty) return;
    this._contentDirty = false;
    if (this.editor.isDestroyed?.()) return;
    this.editor.element.invalidateBlockDecorationDimensions(this.decoration);
  }
}

module.exports = ResultView;
