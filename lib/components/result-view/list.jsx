/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { renderDisplay } = require("./display");
const { outputFontSize } = require("./output-actions");

/** Every output of a run, in order, scrolled to the newest. */
class ScrollList {
  constructor({ outputs }) {
    this.outputs = outputs || [];
    etch.initialize(this);
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
    const maxScrollTop = this.element.scrollHeight - this.element.clientHeight;
    this.element.scrollTop = maxScrollTop > 0 ? maxScrollTop : 0;
  }

  update({ outputs }) {
    this.outputs = outputs || [];
    return etch.update(this);
  }

  destroy() {
    return etch.destroy(this);
  }
}

module.exports = ScrollList;
