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
 * bottom right when the content overflows. Both are positioned out of the
 * layout, so the box is exactly as tall as its content and a one-line result
 * is one line tall. Closing is also middle click, and every action including
 * these two is in the bubble's context menu.
 */
class ResultViewComponent {
  constructor(props) {
    this.props = props;
    this.expanded = false;
    this.hasImage = false;
    this.showExpandButton = false;
    // Whether the action group is laid out across the margin rather than down
    // it, because the result is too short to wear a column of buttons.
    this.actionsInRow = false;
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

  copyResult = () => {
    actions.copyToClipboard(this.refs.display, this.store.outputs);
  };

  openResult = () => {
    actions.openInEditor(this.refs.display, this.store.outputs);
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
          // Overlays outside the right edge, so they take no part in layout:
          // the box stays exactly as tall as its content and never gives up
          // width. Revealed on hover; the context menu names each in words.
          <div
            className={`result-actions${this.actionsInRow ? " result-actions-row" : ""}`}
            ref="actions"
          >
            <div className="icon icon-x" onClick={this.props.destroy} />
            {actions.hasCopyableContent(outputs) ? (
              <div className="icon icon-clippy" onClick={this.copyResult} />
            ) : null}
            <div className="icon icon-link-external" onClick={this.openResult} />
            {this.hasImage ? (
              <div className="icon icon-desktop-download" onClick={this.saveImage} />
            ) : null}
          </div>
        )}
        {!isPlain && this.showExpandButton ? (
          // Pinned to the bottom corner: it is about how far the box extends,
          // and keeping it out of the group leaves that group a slot shorter.
          <div
            className={`result-expand icon icon-${this.expanded ? "fold" : "unfold"}`}
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

    // Both metrics are read before anything writes: scrollToBottom sets
    // scrollTop, and reading scrollHeight after that write forces a synchronous
    // layout. This runs after every patch, so once per frame while output
    // streams in.
    const scrollHeight = display ? display.scrollHeight : 0;
    const clientHeight = display ? display.clientHeight : 0;

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

    // The action group hangs off the right edge, so a column of it can only
    // be as tall as the result: a one-line bubble has room for about two
    // buttons and would wear the rest over the lines below. Lay them in a row
    // instead when they do not fit — short results are narrow, so the margin
    // beside them is exactly where the room is. Measured from the button
    // count rather than the rendered group, which would otherwise report a
    // row as fitting and oscillate between the two layouts every frame.
    const group = this.refs.actions;
    if (group && group.firstElementChild) {
      const needed = group.children.length * group.firstElementChild.offsetHeight;
      const actionsInRow = needed > this.element.clientHeight;
      changed = changed || actionsInRow !== this.actionsInRow;
      this.actionsInRow = actionsInRow;
    }

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
