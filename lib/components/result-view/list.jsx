/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { renderDisplay } = require("./display");
const { outputFontSize } = require("./output-actions");
const OutputScroll = require("./output-scroll");

/** Every output of a run, in order, scrolled to the newest. */
class ScrollList {
  constructor({ outputs }) {
    this.outputs = outputs || [];
    this.outputScroll = new OutputScroll();
    etch.initialize(this);
    this.outputScroll.attach(this.element);
  }

  render() {
    // Etch keeps one element per component, so an empty list renders an empty
    // container rather than nothing at all.
    return (
      <div
        className="scroll-list multiline-container native-key-bindings"
        tabIndex={-1}
        style={{ fontSize: outputFontSize() }}
        attributes={{
          "data-wrap-output": String(lumine.config.get("jupyter-repl.wrapOutput") ?? true),
        }}
      >
        {this.outputs.map((output, index) => (
          <div className="scroll-list-item" key={output._id ?? index}>
            {renderDisplay(output)}
          </div>
        ))}
      </div>
    );
  }

  readAfterUpdate() {
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.outputScroll.scrollToBottom(this.element.scrollHeight, this.element.clientHeight);
  }

  update({ outputs }) {
    this.outputs = outputs || [];
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
