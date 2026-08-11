const { CompositeDisposable, Disposable } = require("lumine");
const OutputStore = require("../../store/output");
const ResultViewComponent = require("./result-view");

// The context-menu commands dispatch at whatever DOM node was clicked; this
// answers which bubble that node belongs to. Weak, so a destroyed bubble
// needs no unregistration.
const viewsByElement = new WeakMap();

// Every bubble that grew has to invalidate its own decoration, but one editor
// update flushes all of them. A run-all fills many bubbles in the same frame,
// and each asking for its own synchronous update measured at half the wall
// time of a twenty-bubble run — 273 editor updates where 20 would do.
//
// The microtask drains after the scheduler's read pass, so every bubble in the
// frame has invalidated by the time it runs, and still before the frame paints
// — which is what keeps a bubble's growth and the editor's compensation in the
// same painted frame.
const editorsAwaitingSync = new Set();

function scheduleEditorSync(editor) {
  const alreadyScheduled = editorsAwaitingSync.size > 0;
  editorsAwaitingSync.add(editor);
  if (alreadyScheduled) {
    return;
  }

  queueMicrotask(() => {
    const editors = [...editorsAwaitingSync];
    editorsAwaitingSync.clear();
    for (const editorToSync of editors) {
      if (editorToSync.isDestroyed?.()) continue;
      editorToSync.component?.updateSync();
    }
  });
}

/**
 * The ResultView owning a DOM node, or null. Walks up to the bubble wrapper,
 * so any node inside a result — output, image, the close button — resolves.
 * @param {Node} node
 * @returns {ResultView | null}
 */
function resultViewForNode(node) {
  const wrapper = node?.closest?.(".jupyter-repl.marker");
  return (wrapper && viewsByElement.get(wrapper)) || null;
}

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
    this.element?.removeEventListener("mousedown", this._middleClickHandler);
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
    // The bubble owns its context menu: it sits inside the editor's DOM, but
    // Undo, Paste and the rest of the host's items act on the buffer, not on
    // a result. The boundary keeps the menu to the bubble's own actions.
    element.setAttribute("data-context-menu-boundary", "");
    // Middle click closes a result anywhere on it — status icon, inline value
    // or block alike — the way it closes a tab. On the wrapper so every form
    // the bubble takes is covered by the one listener, and stopped so the
    // editor never sees a press that was aimed at the result.
    this._middleClickHandler = (event) => {
      if (event.button === 1 && !this.destroyed) {
        event.preventDefault();
        event.stopPropagation();
        this.destroy();
      }
    };
    element.addEventListener("mousedown", this._middleClickHandler);
    this.element = element;
    viewsByElement.set(element, this);
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
    // Only the bubble's own re-measure (expand button, auto-scroll). The
    // editor observes rendered decoration elements itself, and its measure
    // pass announces height changes to every row-to-pixel consumer — the
    // manual nudges this used to send duplicated both halves of that.
    this.component.update();
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
      scheduleEditorSync(this.editor);
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
module.exports.resultViewForNode = resultViewForNode;
