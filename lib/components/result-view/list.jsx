/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { OutputDisplay } = require("./display");
const { outputFontSize } = require("./output-actions");
const { BOKEH_EXEC, PANEL_EXEC, WIDGET_VIEW } = require("../../output-media");
const OutputScroll = require("./output-scroll");

const PAGE_SIZE = 24;

/** Dock history in pages, with stable output views within the current page. */
class ScrollList {
  constructor({ outputs, source }) {
    this.outputs = outputs || [];
    this.source = source;
    this.pageAnchor = null;
    this.resetScroll = false;
    this.mountedLiveOutputs = new WeakSet();
    this.outputScroll = new OutputScroll();
    etch.initialize(this);
    this.outputScroll.attach(this.element);
    etch.getScheduler().readDocument(() => {
      if (this.outputScroll.element) this.scrollToBottom();
    });
  }

  pageStart() {
    if (this.pageAnchor === null) return Math.max(0, this.outputs.length - PAGE_SIZE);
    const index = this.outputs.findIndex((output) => (output._id ?? output) === this.pageAnchor);
    return Math.max(0, index);
  }

  showOlder = () => this.selectPage(Math.max(0, this.pageStart() - PAGE_SIZE));

  showNewer = () => {
    const nextStart = this.pageStart() + PAGE_SIZE;
    if (nextStart >= this.outputs.length - PAGE_SIZE) return this.showLatest();
    return this.selectPage(nextStart);
  };

  showLatest = () => this.selectPage(null);

  selectPage(start) {
    const first = start === null ? null : this.outputs[start];
    this.pageAnchor = first?._id ?? first ?? null;
    this.outputScroll.following = start === null;
    this.resetScroll = start !== null;
    return etch.update(this);
  }

  renderRows(start, end) {
    const rows = [];
    const maxLength = lumine.config.get("jupyter-repl.outputMaxLength");
    for (const [index, output] of this.outputs.entries()) {
      const visible = index >= start && index < end;
      if (!visible && !this.mountedLiveOutputs.has(output)) continue;
      const data = output.data;
      if (
        visible &&
        data &&
        (data[WIDGET_VIEW] || data[BOKEH_EXEC] !== undefined || data[PANEL_EXEC] !== undefined)
      ) {
        // Destroying a live panel disconnects its comms. Keep views the user
        // has already seen attached until their output leaves dock history.
        this.mountedLiveOutputs.add(output);
      }
      rows.push(
        <OutputDisplay
          key={output._id ?? index}
          className={visible ? "scroll-list-item" : ""}
          hidden={!visible}
          output={output}
          maxLength={maxLength}
        />,
      );
    }
    return rows;
  }

  render() {
    const start = this.pageStart();
    const end = Math.min(start + PAGE_SIZE, this.outputs.length);
    const first = this.outputs[start];
    this.visibleStart = first?._id ?? first ?? null;
    // Etch keeps one element per component, so an empty list renders an empty
    // container rather than nothing at all.
    return (
      <div
        className="scroll-list multiline-container native-key-bindings"
        tabIndex={-1}
        style={{ fontSize: outputFontSize() }}
        attributes={{
          "data-scrollbar": "auto",
          "data-scrollbar-layout": "overlay",
          "data-wrap-output": String(lumine.config.get("jupyter-repl.wrapOutput") ?? true),
        }}
      >
        {this.outputs.length > PAGE_SIZE || this.pageAnchor !== null ? (
          <div className="scroll-list-navigation">
            <button className="btn btn-xs" onClick={this.showOlder} disabled={start === 0}>
              Older
            </button>
            <span>{`${start + 1}–${end} / ${this.outputs.length}`}</span>
            <button
              className="btn btn-xs"
              onClick={this.showNewer}
              disabled={end >= this.outputs.length}
            >
              Newer
            </button>
            <button
              className="btn btn-xs"
              onClick={this.showLatest}
              disabled={this.pageAnchor === null}
            >
              Latest
            </button>
          </div>
        ) : null}
        {this.renderRows(start, end)}
      </div>
    );
  }

  readAfterUpdate() {
    if (this.resetScroll) {
      this.resetScroll = false;
      this.element.scrollTop = 0;
    } else if (this.pageAnchor === null) {
      this.scrollToBottom();
    }
  }

  scrollToBottom() {
    this.outputScroll.scrollToBottom(this.element.scrollHeight, this.element.clientHeight);
  }

  update({ outputs, source }) {
    this.outputs = outputs || [];
    if (source !== this.source || this.outputs.length === 0) {
      this.source = source;
      this.pageAnchor = null;
      this.mountedLiveOutputs = new WeakSet();
      this.outputScroll.following = true;
    } else if (
      this.pageAnchor === null &&
      !this.outputScroll.following &&
      this.visibleStart != null
    ) {
      // New entries should not advance the page while the user reads older
      // content. Keep the first displayed entry if history still holds it.
      const latest = this.outputs[Math.max(0, this.outputs.length - PAGE_SIZE)];
      if ((latest._id ?? latest) !== this.visibleStart) this.pageAnchor = this.visibleStart;
    }
    return etch.update(this);
  }

  destroy() {
    this.outputScroll.destroy();
    // destroySync, not destroy: etch defers an ordinary destroy to the next
    // animation frame, and by then the caller has already torn down what owned
    // this. If that frame never arrives — package deactivation, window close —
    // nothing here is cleaned up at all, and a renderer holding a live view
    // keeps receiving updates into DOM nobody can see.
    return etch.destroySync(this);
  }
}

module.exports = ScrollList;
