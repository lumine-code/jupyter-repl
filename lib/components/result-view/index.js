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
    if (this._measureTimer) {
      clearTimeout(this._measureTimer);
      this._measureTimer = null;
    }
    this.disposer.dispose();
    if (this.decoration) {
      this.decoration.destroy();
    }
    this.marker.destroy();
  };

  constructor(markerStore, editor, row, showResult = true) {
    const element = document.createElement("div");
    element.classList.add("jupyter-repl", "marker");
    this.element = element;
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
   * How often a detached bubble asks to be re-measured while its content is
   * still streaming in. Measuring a detached element means the editor moves
   * the whole subtree into its measuring area and lays it out, so a print
   * loop must not pay that price every frame; the settle after the last
   * chunk always measures, so the final height is never stale.
   */
  static DETACHED_MEASURE_THROTTLE_MS = 250;

  /**
   * Ask the editor to re-measure this bubble's decoration when its content
   * has changed. Gated by the dirty flag: the measurement pass's own round
   * trip (parking the element in the measuring area fires the resize
   * observer, which re-runs the render hooks) must not re-invalidate forever.
   *
   * An attached bubble measures synchronously, in the same frame that grew
   * its DOM. Left to the editor's resize observer the correction comes a
   * frame late — observers fire after paint — so every visible result
   * landing pushed the content for one frame before the anchored scroll
   * caught up, a per-element flicker across a whole run. Pre-paint, the
   * growth and the compensation land in one painted frame.
   *
   * A detached bubble has nothing on screen to hold steady, so it is
   * throttled instead, with a trailing call so the last state always lands.
   */
  invalidateDecorationDimensions() {
    if (this.destroyed || !this._contentDirty || this.editor.isDestroyed?.()) return;

    if (document.contains(this.element)) {
      this._contentDirty = false;
      this.editor.element.invalidateBlockDecorationDimensions(this.decoration);
      this.editor.component?.updateSync();
      return;
    }

    const now = Date.now();
    const elapsed = now - (this._lastDetachedMeasure ?? 0);
    if (elapsed >= ResultView.DETACHED_MEASURE_THROTTLE_MS) {
      this._contentDirty = false;
      this._lastDetachedMeasure = now;
      this.editor.element.invalidateBlockDecorationDimensions(this.decoration);
    } else if (!this._measureTimer) {
      this._measureTimer = setTimeout(() => {
        this._measureTimer = null;
        if (this.destroyed || this.editor.isDestroyed?.()) return;
        this._contentDirty = false;
        this._lastDetachedMeasure = Date.now();
        this.editor.element.invalidateBlockDecorationDimensions(this.decoration);
      }, ResultView.DETACHED_MEASURE_THROTTLE_MS - elapsed);
    }
  }
}

module.exports = ResultView;
