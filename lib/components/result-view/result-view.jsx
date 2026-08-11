/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { renderDisplay } = require("./display");
const { renderStatus } = require("./status");
const actions = require("./output-actions");

const SCROLL_HEIGHT = 600;

// Small enough to pull a result right back, large enough that the chrome it is
// dragged around stays usable at the limit.
const MIN_RESIZE_WIDTH = 64;
const MIN_RESIZE_HEIGHT = 32;

/**
 * One result bubble: the outputs of a single execution, shown either inline
 * beside the code or as a scrollable block.
 *
 * A block carries its chrome on hover: close and expand in a column at the top
 * right, and a resize grip in the bottom-right corner. All of it sits inside
 * the box, pinned to its right edge and clear of whatever gutter the display's
 * own scrollbars take, so a result filling the editor's width keeps it on
 * screen — and all of it is positioned out of the layout, so the box is exactly
 * as tall as its content and a one-line result is one line tall. Closing is
 * also middle click, and every action — these, copy, open, save and reset — is
 * in the context menu.
 */
class ResultViewComponent {
  constructor(props) {
    this.props = props;
    this.expanded = false;
    this.hasImage = false;
    this.showExpandButton = false;
    // Width and height the display's scrollbars take, which is how far in from
    // the box's edges the chrome has to sit.
    this.gutterRight = 0;
    this.gutterBottom = 0;
    // Size the grip was dragged to, or null for the natural one. Deliberately
    // not carried anywhere: a re-run builds a new bubble, and a size dragged for
    // one result says nothing about what the next one will hold.
    this.resizedWidth = null;
    this.resizedHeight = null;
    this.resizeOrigin = null;
    // Output count the rendered tree was last searched for an image at.
    this.probedOutputCount = -1;
    this.wheelHandler = null;
    this.wheelElement = null;

    etch.initialize(this);

    this.storeSubscription = this.props.store.onDidUpdate(() => etch.update(this));
    this.afterRender();
  }

  get store() {
    return this.props.store;
  }

  // The bubble sits on a code line, so it is positioned against the metrics the
  // store records for that line rather than by the surrounding layout.
  inlineStyle() {
    const { position } = this.store;
    return {
      marginLeft: `${position.lineLength + position.charWidth}px`,
      // Stop the box from inheriting the editor's (possibly large) line-height,
      // which would make it a full line tall. A compact line-height keeps the
      // box hugging its text.
      lineHeight: "normal",
      // The marker container is a flex row whose default align-items:stretch
      // would stretch this box to the full line height. Opt out so the box keeps
      // its own (compact) height; the transform below then centers it.
      alignSelf: "flex-start",
      // Pull the box fully onto its code line (negative margin reserves no extra
      // height, so lines aren't pushed apart), then visually center the compact
      // box within the line via transform so its text aligns with the editor
      // text. The `50%` resolves to the box's own (now compact) height.
      marginTop: `-${position.lineHeight}px`,
      transform: `translateY(calc(${position.lineHeight / 2}px - 50%))`,
      userSelect: "text",
    };
  }

  handleClick = (event) => {
    if (event.ctrlKey || event.metaKey) {
      actions.openInEditor(this.refs.display, this.store.outputs);
    } else {
      actions.copyToClipboard(this.refs.display, this.store.outputs);
    }
  };

  // A click that ends a text selection is the user selecting, not asking for a
  // copy of everything.
  checkForSelection = (event) => {
    const selection = document.getSelection();
    if (selection && selection.toString()) {
      return;
    }
    this.handleClick(event);
  };

  saveImage = () => {
    actions.saveImage(this.refs.display, this.props.editor);
  };

  toggleExpand = () => {
    this.expanded = !this.expanded;
    // A dragged height is a statement about this one box; fitting it to the
    // content, or putting it back under the cap, replaces that statement.
    this.resizedHeight = null;
    etch.update(this);
  };

  /**
   * Whether the box is a fixed-height scroller rather than one that fits its
   * content. A dragged height always is, whatever expand was left at.
   */
  get isScroller() {
    return this.resizedHeight != null || !this.expanded;
  }

  resetSize = () => {
    if (this.resizedWidth == null && this.resizedHeight == null) {
      return;
    }
    this.resizedWidth = null;
    this.resizedHeight = null;
    etch.update(this);
  };

  /**
   * Drag the bottom-right corner. The size lands on the scroller rather than on
   * the box, because the scroller is what decides wrapping and what grows the
   * scrollbars — the box then follows it, and the overlays keep measuring the
   * one element that moved.
   *
   * Plain mouse events, not pointer capture: etch declares no pointer props, and
   * a window-level pair covers the same ground. A move arriving with no button
   * held is a release that happened outside the window, which is the one thing
   * capture would have caught for free.
   */
  startResize = (event) => {
    const display = this.refs.display;
    if (event.button !== 0 || !display) {
      return;
    }
    // The editor ignores a mousedown inside a block decoration, so nothing
    // upstream starts a selection — but the press must not reach the bubble's
    // own handlers, and the default drag-select has to go.
    event.preventDefault();
    event.stopPropagation();

    const editor = this.props.editor;
    // Read live. The store's editorWidth is only refreshed when the marker
    // moves, so it is stale after a pane resize — and a clamp is only worth
    // having if it is the width the editor has now.
    if (editor && !editor.isDestroyed?.()) {
      this.store.updatePosition({
        editorWidth: editor.element.getWidth(),
        charWidth: editor.getDefaultCharWidth(),
      });
    }
    const { editorWidth, charWidth } = this.store.position;

    this.resizeOrigin = {
      x: event.clientX,
      y: event.clientY,
      width: display.offsetWidth,
      height: display.offsetHeight,
      maxWidth: editorWidth > 0 ? editorWidth - 2 * charWidth : Infinity,
    };
    window.addEventListener("mousemove", this.moveResize);
    window.addEventListener("mouseup", this.endResize);
    // The owner relaxes its re-measure budget for the duration: a drag is a
    // hand, and a hand cannot oscillate.
    this.props.onUserResize?.(true);
  };

  moveResize = (event) => {
    const origin = this.resizeOrigin;
    if (!origin) {
      return;
    }
    if (event.buttons === 0) {
      this.endResize();
      return;
    }
    this.resizedWidth = Math.max(
      MIN_RESIZE_WIDTH,
      Math.min(origin.width + event.clientX - origin.x, origin.maxWidth),
    );
    this.resizedHeight = Math.max(MIN_RESIZE_HEIGHT, origin.height + event.clientY - origin.y);
    // Synchronously, so the box is under the cursor in the frame the move was
    // reported in rather than the one after it.
    etch.updateSync(this);
  };

  endResize = () => {
    if (!this.resizeOrigin) {
      return;
    }
    this.resizeOrigin = null;
    window.removeEventListener("mousemove", this.moveResize);
    window.removeEventListener("mouseup", this.endResize);
    this.props.onUserResize?.(false);
  };

  // Keep a scroll gesture inside a scrollable result instead of letting it
  // continue on through to the editor underneath.
  onWheel = (event) => {
    const element = this.wheelElement;
    if (!element) {
      return;
    }
    const { clientHeight, scrollHeight, clientWidth, scrollWidth, scrollTop, scrollLeft } = element;
    const atTop = scrollTop !== 0 && event.deltaY < 0;
    const atLeft = scrollLeft !== 0 && event.deltaX < 0;
    const atBottom = scrollTop !== scrollHeight - clientHeight && event.deltaY > 0;
    const atRight = scrollLeft !== scrollWidth - clientWidth && event.deltaX > 0;

    if (clientHeight < scrollHeight && (atTop || atBottom)) {
      event.stopPropagation();
    } else if (clientWidth < scrollWidth && (atLeft || atRight)) {
      event.stopPropagation();
    }
  };

  render() {
    const { outputs, status, isPlain, position } = this.store;
    const inlineStyle = this.inlineStyle();

    if (outputs.length === 0 || !this.props.showResult) {
      // The store owns the execution lifecycle (queued -> running -> ok |
      // error) and is stamped explicitly on restart, shutdown, or kernel
      // death — the bubble never consults the kernel.
      return renderStatus(status, inlineStyle);
    }

    const blockStyle = {
      maxWidth: `${position.editorWidth - 2 * position.charWidth}px`,
      margin: "0px",
      userSelect: "text",
    };

    return (
      <div
        className={`${isPlain ? "inline-container" : "multiline-container"} native-key-bindings`}
        tabIndex={-1}
        onClick={isPlain ? this.checkForSelection : null}
        style={isPlain ? inlineStyle : blockStyle}
        attributes={{
          "data-wrap-output": String(lumine.config.get("jupyter-repl.wrapOutput") ?? true),
        }}
      >
        <div
          className="jupyter_cell_display"
          ref="display"
          style={{
            // Empty rather than absent: etch only writes the style keys its
            // vdom names, so a key that comes and goes would leave the last
            // value it wrote on the element forever.
            width: this.resizedWidth == null ? "" : `${this.resizedWidth}px`,
            height: this.resizedHeight == null ? "" : `${this.resizedHeight}px`,
            // A dragged height is the height; anything else would cap it.
            maxHeight:
              this.resizedHeight != null ? "none" : this.expanded ? "100%" : `${SCROLL_HEIGHT}px`,
            overflowY: "auto",
          }}
        >
          {outputs.map((output) => (
            <div key={output._id || output.output_type}>{renderDisplay(output)}</div>
          ))}
        </div>
        {isPlain ? null : (
          // Chrome inside the right edge but out of the layout: the box stays
          // exactly as tall as its content, never gives up width, and stays
          // reachable however wide it grows. Only what is about the box itself
          // is here — copy, open, save and reset are words in the context menu,
          // which needs neither room nor hover to find.
          <div className="result-actions" style={{ right: `${this.gutterRight}px` }}>
            <div className="result-close icon icon-x" onClick={this.props.destroy} />
            {this.showExpandButton ? (
              <div
                className={`result-expand icon icon-${this.expanded ? "fold" : "unfold"}`}
                onClick={this.toggleExpand}
              />
            ) : null}
          </div>
        )}
        {isPlain ? null : (
          // The corner, which is where a resize grip is looked for. It owns the
          // corner outright — that is why expand moved up into the column.
          <div
            className="result-resize"
            style={{ right: `${this.gutterRight}px`, bottom: `${this.gutterBottom}px` }}
            onMouseDown={this.startResize}
          />
        )}
      </div>
    );
  }

  // Etch runs this after each patch, which is where the rendered DOM can be
  // measured and the wheel handler re-attached.
  readAfterUpdate() {
    this.afterRender();
  }

  afterRender() {
    const display = this.refs.display;
    const isPlain = this.store.isPlain;

    // Every metric is read before anything writes: scrollToBottom sets
    // scrollTop, and reading scrollHeight after that write forces a synchronous
    // layout. This runs after every patch, so once per frame while output
    // streams in.
    const scrollHeight = display ? display.scrollHeight : 0;
    const clientHeight = display ? display.clientHeight : 0;
    // What the display's own scrollbars take, which is how far in from the
    // box's edges the overlays sit. Measured rather than assumed: the width is
    // the platform's, and an overlay scrollbar's is zero. Absolute offsets are
    // measured from the container's padding box, which is exactly this
    // element's border box — so these are the offsets directly.
    const gutterRight = display ? display.offsetWidth - display.clientWidth : 0;
    const gutterBottom = display ? display.offsetHeight - display.clientHeight : 0;

    this.scrollToBottom(display, scrollHeight, clientHeight, isPlain);
    this.syncWheelHandler(isPlain);

    // An image can only arrive as a new output, since reduceOutputs merges a
    // stream into the one already there — so the output count is enough to know
    // when it is worth walking the rendered tree again. Only the context menu
    // reads this one, so a change needs no re-render of its own.
    const outputCount = this.store.outputs.length;
    if (outputCount !== this.probedOutputCount) {
      this.probedOutputCount = outputCount;
      this.hasImage = display ? actions.getImage(display) !== null : false;
    }

    // Not cacheable the same way: a growing stream merges into one output, so
    // the count holds still while the height climbs past the threshold. This
    // one does render — the expand overlay appears with it — so a flip needs
    // another pass, and only a flip, or measuring would loop forever. Once a
    // height has been dragged the cap no longer describes the box, so overflow
    // is what the question becomes.
    const showExpandButton =
      this.resizedHeight != null ? scrollHeight > clientHeight : scrollHeight > SCROLL_HEIGHT;
    let changed = showExpandButton !== this.showExpandButton;
    this.showExpandButton = showExpandButton;

    // A gutter appears and disappears with the content, so the offsets are
    // state like the flag above. The overlays are out of the layout and cannot
    // move a scrollbar, so re-rendering on a change settles rather than loops.
    changed = changed || gutterRight !== this.gutterRight || gutterBottom !== this.gutterBottom;
    this.gutterRight = gutterRight;
    this.gutterBottom = gutterBottom;

    if (changed) {
      etch.update(this);
    }

    // The DOM now shows the latest content; if it changed, the owning view
    // asks the editor to re-measure the block decoration's height.
    this.props.onContentRendered?.();
  }

  syncWheelHandler(isPlain) {
    const display = this.refs.display;
    const wanted = !isPlain && this.isScroller ? display : null;

    if (this.wheelElement === wanted) {
      return;
    }
    if (this.wheelElement && this.wheelHandler) {
      this.wheelElement.removeEventListener("wheel", this.wheelHandler);
    }
    this.wheelElement = wanted;
    if (wanted) {
      this.wheelHandler = this.onWheel;
      wanted.addEventListener("wheel", this.wheelHandler, { passive: true });
    }
  }

  scrollToBottom(display, scrollHeight, clientHeight, isPlain) {
    if (
      !display ||
      !this.isScroller ||
      isPlain ||
      lumine.config.get("jupyter-repl.autoScroll") === false
    ) {
      return;
    }
    const maxScrollTop = scrollHeight - clientHeight;
    display.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
  }

  update(props) {
    if (props) {
      this.props = props;
    }
    return etch.update(this);
  }

  destroy() {
    // A bubble closed mid-drag would otherwise leave its window listeners
    // behind, still writing to a component nobody can see.
    this.endResize();
    if (this.wheelElement && this.wheelHandler) {
      this.wheelElement.removeEventListener("wheel", this.wheelHandler);
      this.wheelElement = null;
      this.wheelHandler = null;
    }
    this.storeSubscription.dispose();
    // destroySync, not destroy: etch defers an ordinary destroy to the next
    // animation frame, and by then the caller has already torn down what owned
    // this. If that frame never arrives — package deactivation, window close —
    // nothing here is cleaned up at all, and a renderer holding a live view
    // keeps receiving updates into DOM nobody can see.
    return etch.destroySync(this);
  }
}

module.exports = ResultViewComponent;
