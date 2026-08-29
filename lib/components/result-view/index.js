const { CompositeDisposable, Disposable } = require("lumine");
const OutputStore = require("../../store/output");
const ResultViewComponent = require("./result-view");
const { registerResultView } = require("./surface-transition");

// The context-menu commands dispatch at whatever DOM node was clicked; this
// answers which bubble that node belongs to. Weak, so a destroyed bubble
// needs no unregistration.
const viewsByElement = new WeakMap();

// Every bubble that grew has to invalidate its own decoration, but one editor
// update flushes all of them. A run-all fills many bubbles in the same frame,
// and each asking for its own synchronous update measured at half the wall
// time of a twenty-bubble run — 273 editor updates where 20 would do.
//
// The drain goes through the document scheduler owned by `lumine.views`, which
// is also where `TextEditorComponent#scheduleUpdate` writes for that surface:
// it batches every writer into one animation frame, so the flush runs before
// the frame's style, layout and paint and a bubble's growth still lands in the
// same painted frame. Two
// things follow from sharing that scheduler rather than calling
// requestAnimationFrame directly. The flush runs in the same batch as the
// update core scheduled for the same invalidation, instead of racing it. And
// coalescing now spans tasks: results stream in one macrotask each, and the
// microtask drain this replaced bought one full editor update per result —
// 2653 of them for a 3000-cell run.
//
// `lumine.views` by name, not this package's `etch.getScheduler()`: the package
// resolves its own copy of etch, whose scheduler may be private rather than the
// editor's view registry, so scheduling there would coordinate with nothing.
// Keep a queue per document scheduler. A detached surface owns a different
// animation frame, and a dead child document must not leave the primary queue
// looking scheduled forever after its scheduler is cleared.
const editorSyncStateByScheduler = new WeakMap();

function scheduleEditorSync(editor) {
  const domDocument = editor.element?.ownerDocument;
  if (!domDocument?.defaultView) return;
  const scheduler = lumine.views.forDocument(domDocument);
  let state = editorSyncStateByScheduler.get(scheduler);
  if (!state) {
    state = { editors: new Set(), cycle: null };
    editorSyncStateByScheduler.set(scheduler, state);
  }
  state.editors.add(editor);
  const cycle = scheduler.getNextUpdatePromise();
  if (state.cycle === cycle) return;
  state.cycle = cycle;

  scheduler.updateDocument(() => {
    if (state.cycle !== cycle) return;
    // Clear before updating: an exception must not poison later batches, and
    // an invalidation caused by updateSync must be free to schedule a new one.
    state.cycle = null;
    const editors = [...state.editors];
    state.editors.clear();
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
    // A bubble closed mid-drag must not leave the editor's anchor pinned to a
    // decoration that is about to stop existing.
    this.setUserResizing(false);
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
    const domDocument = editor.element?.ownerDocument || document;
    const element = domDocument.createElement("div");
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
        markerStore.rowChanged(this);
        // `lineLength` below is the marker's screen column, and the rest of
        // the position is editor-wide metrics an edit cannot touch — so an
        // edit that moved this marker down a row without changing its column
        // has nothing to recompute. Typing above a bubble is exactly that
        // case, and it is the common one: recomputing regardless made each
        // keystroke pay a layout read per bubble below the cursor, 274 ms per
        // keystroke at 2000 results. Direct marker manipulation
        // (textChanged false) always recomputes, as it always did.
        if (
          event.textChanged &&
          event.newHeadScreenPosition.column === event.oldHeadScreenPosition.column
        ) {
          return;
        }
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
    // The height the editor was last asked to measure. Anything else the box
    // reports is content that resized itself — see claimSelfResize.
    this._measuredHeight = null;
    this._selfResizeBudget = 0;
    this._lastSelfResizeAt = 0;
    this.disposer.add(
      this.outputStore.onDidUpdate(() => {
        this._contentDirty = true;
      }),
    );

    // Set while the user is dragging the resize grip. See claimSelfResize.
    this._userResizing = false;
    this._scrollAnchorPin = null;

    this.componentProps = {
      store: this.outputStore,
      editor,
      destroy: this.destroy,
      showResult,
      onContentRendered: () => this.invalidateDecorationDimensions(),
      onUserResize: (active) => this.setUserResizing(active),
    };
    this.component = new ResultViewComponent({
      ...this.componentProps,
      document: domDocument,
    });
    element.appendChild(this.component.element);
    this.disposer.add(
      new Disposable(() => this.component?.destroy()),
      registerResultView(editor, this),
    );

    // The bubble lives in a block decoration the editor attaches and lays out
    // asynchronously, so a resize is also the component's cue to re-measure:
    // the toolbar's expand button and the auto-scroll both read scrollHeight,
    // and a final output that patched before attachment measured a detached
    // element as zero — with no further outputs, nothing else would ever
    // correct it.
    this.observeElement(domDocument);
  }

  observeElement(domDocument) {
    this.resizeObserver = new domDocument.defaultView.ResizeObserver((entries) =>
      this.handleElementResize(entries),
    );
    this.resizeObserver.observe(this.element);
  }

  prepareWindowSurfaceTransition() {
    const surfaceState = this.component?.captureSurfaceState?.() || null;
    this.component?.destroy();
    this.component = null;
    this.element.replaceChildren();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    return surfaceState;
  }

  restoreWindowSurface(domDocument, surfaceState) {
    if (this.destroyed || this.component) return;
    // A virtualized block decoration can be outside the editor subtree while
    // core adopts the pane item. Adopt it explicitly before mounting children,
    // otherwise appendChild would pull their freshly built nodes back into the
    // old document.
    if (this.element.ownerDocument !== domDocument) domDocument.adoptNode(this.element);
    this.component = new ResultViewComponent({
      ...this.componentProps,
      document: domDocument,
      surfaceState,
    });
    this.element.replaceChildren(this.component.element);
    this.observeElement(domDocument);
    this._contentDirty = true;
  }

  /**
   * Opens and closes everything a drag on the resize grip needs, which is two
   * things that both have to last exactly as long as the gesture.
   *
   * The budget bypass is local: `claimSelfResize` would otherwise starve four
   * frames in and stop marking the bubble dirty. The scroll-anchor pin is the
   * editor's: growing a block decoration displaces everything after it, and the
   * measure pass answers that by holding the cursor's row — or, when the cursor
   * is off screen, the viewport midpoint — still. Either one slides this bubble
   * by whatever the drag just added, so the grip climbs out from under the
   * pointer at twice the speed it is dragged. Pinning the anchor to the bubble
   * makes its top edge the fixed thing instead, which is what a hand on the
   * bottom-right corner is asking for.
   */
  setUserResizing(active) {
    this._userResizing = active;
    if (active) {
      if (!this._scrollAnchorPin && this.decoration && !this.editor.isDestroyed?.()) {
        this._scrollAnchorPin = this.editor.element.pinScrollAnchorToBlockDecoration(
          this.decoration,
        );
      }
      return;
    }
    this._scrollAnchorPin?.dispose();
    this._scrollAnchorPin = null;
  }

  handleElementResize(entries) {
    if (this.destroyed) return;
    // Content that changed its own size announces no store update, so nothing
    // would otherwise mark it dirty and the height the editor holds would stay
    // one frame — or one gesture — behind.
    if (this.claimSelfResize(entries)) {
      this._contentDirty = true;
    }
    // Only the bubble's own re-measure (expand button, auto-scroll). The
    // editor observes rendered decoration elements itself, and its measure
    // pass announces height changes to every row-to-pixel consumer — the
    // manual nudges this used to send duplicated both halves of that.
    this.component.update();
  }

  /**
   * How many self-driven re-measures a bubble may ask for in one burst, and how
   * long a quiet gap has to be to refill that allowance.
   */
  static SELF_RESIZE_BUDGET = 4;
  static SELF_RESIZE_BURST_MS = 250;

  /**
   * Whether an observation is content resizing itself, rather than the
   * measurement pass's own round trip.
   *
   * A widget expanding an accordion, an image finishing its decode, a progress
   * bar growing a label: all change the bubble's height with no store update to
   * mark it dirty. The editor observes decoration elements itself and would
   * correct the height a frame later, but a frame late is exactly the flicker
   * the synchronous path below exists to remove.
   *
   * Three things keep this from reopening the loop that gate was written for.
   * The height comes from the observation, so a measurement that leaves the box
   * alone produces nothing to answer. It is compared against the height the
   * editor was last asked to measure, so the round trip's own report is
   * recognised and dropped. And what survives both is budgeted: content that
   * sizes itself from the box it is measured in — a widget at full width inside
   * a scroller whose bar appears with the height it causes — alternates between
   * two genuinely different heights, and only a budget stops that. A quiet gap
   * refills it, because a gesture is orders of magnitude slower than an
   * oscillation.
   *
   * A drag on the resize grip is the exception, and has to be. It changes the
   * height every frame for as long as it lasts, so it never leaves the quiet gap
   * that refills the budget: four frames in, the allowance would be spent and
   * the editor would hold the pre-drag height while the content reflowed under
   * it, misplacing every line below the bubble until the hand stopped. A hand is
   * also the one input that cannot oscillate, which is the only thing the budget
   * exists to stop.
   */
  claimSelfResize(entries) {
    // A detached bubble has no layout and cannot resize itself — and the
    // detached branch below is the one that parks the element in the editor's
    // measuring area, which is the round trip that would loop. Only an attached
    // bubble reports its own growth.
    if (!this.element.ownerDocument.contains(this.element)) return false;

    const entry = entries && entries[entries.length - 1];
    const height = entry?.borderBoxSize?.[0]?.blockSize ?? entry?.contentRect?.height ?? null;
    if (height == null || height === this._measuredHeight) return false;

    if (this._userResizing) return true;

    const now = Date.now();
    if (now - (this._lastSelfResizeAt ?? 0) > ResultView.SELF_RESIZE_BURST_MS) {
      this._selfResizeBudget = ResultView.SELF_RESIZE_BUDGET;
    }
    this._lastSelfResizeAt = now;
    if (!this._selfResizeBudget) return false;
    this._selfResizeBudget -= 1;
    return true;
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

    if (this.element.ownerDocument.contains(this.element)) {
      this._contentDirty = false;
      // What the editor is about to measure. The next observation reporting
      // this same height is the measurement's own echo, not new content.
      this._measuredHeight = this.element.offsetHeight;
      this.editor.element.invalidateBlockDecorationDimensions(this.decoration);
      scheduleEditorSync(this.editor);
      return;
    }

    // Detached: nothing observes it and nothing can have resized it, so there
    // is no measured height worth remembering.
    this._measuredHeight = null;

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
