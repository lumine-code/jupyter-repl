/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { CompositeDisposable } = require("lumine");
const { renderDisplay } = require("./display");
const { outputFontSize } = require("./output-actions");

/**
 * A watch's accumulated values, with a slider to scrub back through them.
 */
class History {
  constructor({ store }) {
    this.store = store;
    etch.initialize(this);

    this.disposables = new CompositeDisposable(
      this.store.onDidUpdate(() => etch.update(this)),
      lumine.commands.add(this.element, {
        "core:move-left": () => this.store.decrementIndex(),
        "core:move-right": () => this.store.incrementIndex(),
      }),
    );
  }

  onIndexChange = (event) => {
    this.store.setIndex(Number(event.target.value));
  };

  renderSlider() {
    const { index, outputs } = this.store;
    return (
      <div className="slider">
        <div className="current-output">
          <span
            className="btn btn-xs icon icon-chevron-left"
            onClick={() => this.store.decrementIndex()}
          />
          <span>
            {String(index + 1)}/{String(outputs.length)}
          </span>
          <span
            className="btn btn-xs icon icon-chevron-right"
            onClick={() => this.store.incrementIndex()}
          />
        </div>
        <input
          className="input-range"
          max={String(outputs.length - 1)}
          min="0"
          onChange={this.onIndexChange}
          type="range"
          value={String(index)}
        />
      </div>
    );
  }

  render() {
    const output = this.store.outputs[this.store.index];
    // Etch keeps one element per component, so an empty history renders an
    // empty container rather than nothing at all.
    if (!output) {
      return <div className="history output-area" />;
    }

    return (
      <div className="history output-area">
        {this.renderSlider()}
        <div
          className="multiline-container native-key-bindings"
          tabIndex={-1}
          style={{ fontSize: outputFontSize() }}
          attributes={{
            "data-wrap-output": String(lumine.config.get("jupyter-repl.wrapOutput") ?? true),
          }}
        >
          {renderDisplay(output)}
        </div>
      </div>
    );
  }

  update() {
    return etch.update(this);
  }

  destroy() {
    this.disposables.dispose();
    // destroySync, not destroy: etch defers an ordinary destroy to the next
    // animation frame, and by then the caller has already torn down what owned
    // this. If that frame never arrives — package deactivation, window close —
    // nothing here is cleaned up at all, and a renderer holding a live view
    // keeps receiving updates into DOM nobody can see.
    return etch.destroySync(this);
  }
}

module.exports = History;
