/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { CompositeDisposable } = require("lumine");
const { renderDisplay } = require("./display");
const { renderStatus } = require("./status");
const actions = require("./output-actions");

const SCROLL_HEIGHT = 600;

/**
 * One result bubble: the outputs of a single execution, shown either inline
 * beside the code or as a scrollable block with a toolbar.
 */
class ResultViewComponent {
  constructor(props) {
    this.props = props;
    this.expanded = false;
    this.hasImage = false;
    this.showExpandButton = false;
    // Output count the rendered tree was last searched for an image at.
    this.probedOutputCount = -1;
    this.wheelHandler = null;
    this.wheelElement = null;
    this.containerTooltip = new CompositeDisposable();
    this.buttonTooltip = new CompositeDisposable();
    this.closeTooltip = new CompositeDisposable();
    this.saveTooltip = new CompositeDisposable();

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
        {isPlain ? null : this.renderToolbar(outputs)}
      </div>
    );
  }

  renderToolbar(outputs) {
    return (
      <div className="toolbar">
        <div className="icon icon-x" onClick={this.props.destroy} ref="closeButton" />

        <div style={{ flex: 1, minHeight: "0.25em" }} />

        {actions.hasCopyableContent(outputs) ? (
          <div className="icon icon-clippy" onClick={this.handleClick} ref="copyButton" />
        ) : null}

        {this.hasImage ? (
          <div className="icon icon-desktop-download" onClick={this.saveImage} ref="saveButton" />
        ) : null}

        {this.showExpandButton ? (
          <div
            className={`icon icon-${this.expanded ? "fold" : "unfold"}`}
            onClick={this.toggleExpand}
          />
        ) : null}
      </div>
    );
  }

  // Etch runs this after each patch, which is where the rendered DOM can be
  // measured and the tooltips and wheel handler re-attached.
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
    this.syncTooltips(isPlain);
    this.syncWheelHandler(isPlain);

    let changed = false;

    // An image can only arrive as a new output, since reduceOutputs merges a
    // stream into the one already there — so the output count is enough to know
    // when it is worth walking the rendered tree again.
    const outputCount = this.store.outputs.length;
    if (outputCount !== this.probedOutputCount) {
      this.probedOutputCount = outputCount;
      const hasImage = display ? actions.getImage(display) !== null : false;
      if (hasImage !== this.hasImage) {
        this.hasImage = hasImage;
        changed = true;
      }
    }

    // Not cacheable the same way: a growing stream merges into one output, so
    // the count holds still while the height climbs past the threshold.
    const showExpandButton = scrollHeight > SCROLL_HEIGHT;
    if (showExpandButton !== this.showExpandButton) {
      this.showExpandButton = showExpandButton;
      changed = true;
    }

    if (changed) {
      etch.update(this);
    }
  }

  syncTooltips(isPlain) {
    const display = this.refs.display;
    if (isPlain && display) {
      this.addTooltip(this.containerTooltip, () =>
        lumine.tooltips.addComposite(display, [
          { title: "Copy", keyBindingExtra: "LMB" },
          { title: "Open in editor", keyBindingExtra: "cmdorctrl+LMB" },
        ]),
      );
    } else {
      this.containerTooltip.dispose();
      this.containerTooltip = new CompositeDisposable();
    }

    if (this.refs.copyButton) {
      this.addTooltip(this.buttonTooltip, () =>
        lumine.tooltips.addComposite(this.refs.copyButton, [
          { title: "Copy", keyBindingExtra: "LMB" },
          { title: "Open in editor", keyBindingExtra: "cmdorctrl+LMB" },
        ]),
      );
    }
    if (this.refs.closeButton) {
      this.addTooltip(this.closeTooltip, () =>
        lumine.tooltips.add(this.refs.closeButton, { title: "Close" }),
      );
    }
    if (this.refs.saveButton) {
      this.addTooltip(this.saveTooltip, () =>
        lumine.tooltips.add(this.refs.saveButton, { title: "Save image as..." }),
      );
    }
  }

  addTooltip(composite, create) {
    if (composite.disposables && composite.disposables.size > 0) {
      return;
    }
    composite.add(create());
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
    this.containerTooltip.dispose();
    this.buttonTooltip.dispose();
    this.closeTooltip.dispose();
    this.saveTooltip.dispose();
    return etch.destroy(this);
  }
}

module.exports = ResultViewComponent;
