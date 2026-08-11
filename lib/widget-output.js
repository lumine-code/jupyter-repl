const etch = require("@lumine-code/etch");

const { renderDisplay } = require("./components/result-view/display");
const { msgSpecToNotebookFormat, reduceOutputs, OUTPUT_TYPES } = require("./output-utils");
const { log } = require("./utils");

// The Output widget, implemented here rather than taken from
// @jupyter-widgets/output.
//
// Upstream's view renders through JupyterLab's OutputArea and its rendermime
// registry, neither of which this editor has; taking the package would mean
// taking most of JupyterLab with it, to reach a renderer this package already
// owns. What is left once that is stripped is a model with two traits and a
// view that draws a list of outputs, which is what this file is.
//
// It matters more than its size suggests: interact(), interactive(),
// interactive_output() and tqdm.notebook are all built on Output, so without it
// the most common way anyone uses ipywidgets renders nothing.

const OUTPUT_MODULE = "@jupyter-widgets/output";
const OUTPUT_VERSION = "1.0.0";

/** Draws a list of Jupyter outputs, using the same renderers a cell does. */
class OutputList {
  constructor(props) {
    this.props = props;
    etch.initialize(this);
  }

  render() {
    const outputs = this.props.outputs || [];
    return etch.dom.div(
      { className: "output-widget-outputs" },
      ...outputs.map((output, index) =>
        etch.dom.div({ key: output._id ?? index }, renderDisplay(output)),
      ),
    );
  }

  update(props) {
    this.props = props;
    return etch.update(this);
  }

  destroy() {
    return etch.destroySync(this);
  }
}

/**
 * Build the module ipywidgets resolves "@jupyter-widgets/output" against.
 *
 * Takes the base classes rather than importing them, because this module is
 * loaded from the widget bundle and requiring it back would close a cycle.
 */
function createOutputModule(base) {
  class OutputModel extends base.DOMWidgetModel {
    defaults() {
      return {
        ...super.defaults(),
        _model_name: "OutputModel",
        _view_name: "OutputView",
        _model_module: OUTPUT_MODULE,
        _view_module: OUTPUT_MODULE,
        _model_module_version: OUTPUT_VERSION,
        _view_module_version: OUTPUT_VERSION,
        outputs: [],
        msg_id: "",
      };
    }

    initialize(attributes, options) {
      super.initialize(attributes, options);
      this._outputRoute = null;
      // `msg_id` is how Python says "everything the running cell prints from
      // here belongs to me": __enter__ sets it to the request currently
      // executing, __exit__ clears it.
      this.listenTo(this, "change:msg_id", () => this._followMsgId());
      this._followMsgId();
    }

    _followMsgId() {
      this._outputRoute?.dispose();
      this._outputRoute = null;

      const msgId = this.get("msg_id");
      if (!msgId) {
        return;
      }
      const transport = this.widget_manager?._transport?.();
      if (!transport?.registerOutputRoute) {
        return;
      }
      try {
        this._outputRoute = transport.registerOutputRoute(msgId, (message) =>
          this._captureOutput(message),
        );
      } catch (error) {
        log("widgets: could not divert output to an Output widget:", error);
      }
    }

    /**
     * Take one diverted message into the trait the view draws.
     *
     * The trait is replaced rather than mutated: Backbone compares by identity
     * to decide whether anything changed, so appending in place would render
     * nothing. Nothing is sent back to the kernel either — this is the frontend
     * mirroring what the kernel already knows it printed.
     */
    _captureOutput(message) {
      const msgType = message.header?.msg_type;
      if (msgType === "clear_output") {
        if (message.content?.wait) {
          this._clearOnNextOutput = true;
        } else {
          this.set("outputs", []);
        }
        return;
      }
      if (!OUTPUT_TYPES.includes(msgType)) {
        return;
      }
      const previous = this._clearOnNextOutput ? [] : [...(this.get("outputs") || [])];
      this._clearOnNextOutput = false;
      // Stream chunks merge exactly as they do in a cell, so a print loop is
      // one output rather than several thousand.
      this.set("outputs", reduceOutputs(previous, msgSpecToNotebookFormat(message)));
    }

    close(...args) {
      this._outputRoute?.dispose();
      this._outputRoute = null;
      return super.close(...args);
    }
  }

  class OutputView extends base.DOMWidgetView {
    render() {
      super.render();
      this.el.classList.add("jupyter-widgets", "widget-output");
      this.list = new OutputList({ outputs: this.model.get("outputs") });
      this.el.appendChild(this.list.element);
      this.listenTo(this.model, "change:outputs", () => this._redraw());
      return this;
    }

    _redraw() {
      this.list?.update({ outputs: this.model.get("outputs") });
    }

    remove() {
      // Before the element goes, so the outputs' own renderers — a plot, a
      // MathJax render — are disposed rather than orphaned.
      this.list?.destroy();
      this.list = null;
      return super.remove();
    }
  }

  return { OutputModel, OutputView };
}

module.exports = { createOutputModule, OutputList, OUTPUT_MODULE, OUTPUT_VERSION };
