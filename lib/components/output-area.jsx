/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { CompositeDisposable } = require("lumine");
const Anser = require("anser");
const History = require("./result-view/history");
const ScrollList = require("./result-view/list");
const { OUTPUT_AREA_URI } = require("../utils");
const { renderEmptyMessage } = require("./empty-message");

/**
 * The dock view of the current kernel's output, either as a scrubbable history
 * or as one continuous list.
 */
class OutputArea {
  constructor({ store }) {
    this.store = store;
    this.showHistory = true;
    this.outputSubscription = null;

    etch.initialize(this);

    this.disposables = new CompositeDisposable(
      this.store.onDidChangeCurrentKernel(() => this.watchCurrentKernel()),
    );

    this.watchCurrentKernel();
  }

  get kernel() {
    return this.store.kernel;
  }

  // Output belongs to a kernel, so the subscription moves whenever the store
  // reports a different one.
  watchCurrentKernel() {
    this.outputSubscription?.dispose();
    const outputStore = this.kernel?.outputStore;
    this.outputSubscription = outputStore ? outputStore.onDidUpdate(() => etch.update(this)) : null;
    etch.update(this);
  }

  setHistory = () => {
    this.showHistory = true;
    etch.update(this);
  };

  setScrollList = () => {
    this.showHistory = false;
    etch.update(this);
  };

  getOutputText(output) {
    switch (output.output_type) {
      case "stream":
        return output.text;

      case "execute_result":
        return output.data["text/plain"];

      case "error":
        return Array.isArray(output.traceback) ? output.traceback.join("\n") : "";

      default:
        return null;
    }
  }

  handleClick = () => {
    const outputStore = this.kernel?.outputStore;
    if (!outputStore) {
      return;
    }
    const output = outputStore.outputs[outputStore.index];
    const copyOutput = output && this.getOutputText(output);

    if (copyOutput) {
      lumine.clipboard.write(Anser.ansiToText(copyOutput));
      lumine.notifications.addSuccess("Copied to clipboard");
    } else {
      lumine.notifications.addWarning("Nothing to copy");
    }
  };

  renderToolbar(outputStore) {
    return (
      <div className="block">
        <div className="btn-group">
          <button
            className={`btn icon icon-clock${this.showHistory ? " selected" : ""}`}
            onClick={this.setHistory}
          />
          <button
            className={`btn icon icon-three-bars${!this.showHistory ? " selected" : ""}`}
            onClick={this.setScrollList}
          />
        </div>
        <div style={{ float: "right" }}>
          {this.showHistory ? (
            <button className="btn icon icon-clippy" onClick={this.handleClick}>
              Copy
            </button>
          ) : null}
          <button className="btn icon icon-trashcan" onClick={() => outputStore.clear()}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  render() {
    const kernel = this.kernel;

    if (!kernel) {
      // Without the dock setting the view closes itself rather than sitting
      // there empty; the hide is deferred so it does not run inside a render.
      if (!lumine.config.get("jupyter-repl.outputAreaDock")) {
        etch.getScheduler().updateDocument(() => lumine.workspace.hide(OUTPUT_AREA_URI));
      }
      return <div className="sidebar output-area">{renderEmptyMessage()}</div>;
    }

    const outputStore = kernel.outputStore;
    const hasOutputs = outputStore.outputs.length > 0;

    return (
      <div className="sidebar output-area">
        {hasOutputs ? this.renderToolbar(outputStore) : renderEmptyMessage()}
        {this.showHistory ? (
          <History store={outputStore} />
        ) : (
          <ScrollList outputs={outputStore.outputs} />
        )}
      </div>
    );
  }

  update() {
    return etch.update(this);
  }

  destroy() {
    this.outputSubscription?.dispose();
    this.disposables.dispose();
    return etch.destroy(this);
  }
}

module.exports = OutputArea;
