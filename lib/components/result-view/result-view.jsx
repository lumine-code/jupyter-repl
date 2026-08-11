/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { renderDisplay } = require("./display");
const { renderStatus } = require("./status");
const actions = require("./output-actions");

const SCROLL_HEIGHT = 600;

/**
 * One result bubble: the outputs of a single execution, shown either inline
 * beside the code or as a scrollable block.
 *
 * A block carries two hover overlays — close at the top right, expand at the
 * bottom right when the content overflows. Both sit inside the box, pinned to
 * its right edge and clear of whatever gutter the display's own scrollbars
 * take, so a result filling the editor's width keeps them on screen. Both are
 * positioned out of the layout, so the box is exactly as tall as its content
 * and a one-line result is one line tall. Closing is also middle click, and
 * every action — these two, copy, open and save — is in the context menu.
 */
class ResultViewComponent {
  constructor(props) {
    this.props = props;
    this.expanded = false;
    this.hasImage = false;
    this.showExpandButton = false;
    // Width and height the display's scrollbars take, which is how far in from
    // the box's edges the overlays have to sit.
    this.gutterRight = 0;
    this.gutterBottom = 0;
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
    etch.update(this);
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
            maxHeight: this.expanded ? "100%" : `${SCROLL_HEIGHT}px`,
            overflowY: "auto",
          }}
        >
          {outputs.map((output) => (
            <div key={output._id || output.output_type}>{renderDisplay(output)}</div>
          ))}
        </div>
        {isPlain ? null : (
          // Overlays inside the right edge but out of the layout: the box stays
          // exactly as tall as its content, never gives up width, and stays
          // reachable however wide it grows. Only the two that are about the
          // box itself are here — copy, open and save are words in the context
          // menu, which needs no room and no hover to find.
          <div
            className="result-close icon icon-x"
            style={{ right: `${this.gutterRight}px` }}
            onClick={this.props.destroy}
          />
        )}
        {!isPlain && this.showExpandButton ? (
          <div
            className={`result-expand icon icon-${this.expanded ? "fold" : "unfold"}`}
            style={{ right: `${this.gutterRight}px`, bottom: `${this.gutterBottom}px` }}
            onClick={this.toggleExpand}
          />
        ) : null}
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
    // another pass, and only a flip, or measuring would loop forever.
    const showExpandButton = scrollHeight > SCROLL_HEIGHT;
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
    const wanted = !this.expanded && !isPlain ? display : null;

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
      this.expanded ||
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
