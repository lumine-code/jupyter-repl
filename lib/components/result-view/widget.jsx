/** @jsx etch.dom */
const etch = require("@lumine-code/etch"); // JSX factory
const { managerForModelId } = require("../../widget-registry");

// An ipywidget view is a long-lived DOM node bound to a kernel-side object, and
// this package re-renders every output on every store update — a buffer edit
// that moves the marker is enough. So the component below guards hard on
// identity, and disposes deliberately: a view that is dropped without
// view.remove() stays in its model's view list and keeps rendering into DOM
// nobody can see, for as long as the kernel lives.

// The widget bundle, loaded on first use. Function-body, like plotly.jsx and
// vega.jsx: spec/manifest-services-spec.js fails on a top-level require of it,
// and a window that never opens a kernel should never parse 700 KB. No dynamic
// import ceremony as in latex.jsx, because by the time a widget-view output
// reaches a renderer a manager exists, and building one already loaded this —
// the require is a cache hit. Without a manager the renderer declines instead.
let luminoRuntime = null;
function lumino() {
  if (luminoRuntime === null) {
    try {
      const { lumino: luminoWidgets } = require("../../vendor/jupyter-widgets");
      const { MessageLoop } = require("@lumino/messaging");
      luminoRuntime = { Widget: luminoWidgets.Widget, MessageLoop };
    } catch (error) {
      console.error("[jupyter-repl] Lumino runtime unavailable:", error);
      luminoRuntime = false; // Fall back to a plain appendChild.
    }
  }
  return luminoRuntime || null;
}

/**
 * Put a view's element in the DOM, telling Lumino about it.
 *
 * The box, tab and accordion views are Lumino panels whose layout runs only
 * once they are told they are attached; without these messages an HBox renders
 * collapsed. Feature-detected, because a plain DOMWidgetView has no panel.
 */
function attachWidget(view, host) {
  if (!view || !host) {
    return;
  }
  const panel = view.luminoWidget || view.pWidget;
  const runtime = panel && lumino();
  if (!runtime) {
    host.appendChild(view.el);
    return;
  }
  runtime.MessageLoop.sendMessage(panel, runtime.Widget.Msg.BeforeAttach);
  host.appendChild(view.el);
  runtime.MessageLoop.sendMessage(panel, runtime.Widget.Msg.AfterAttach);
}

/**
 * Dispose a view: take it out of the DOM, then let Backbone unbind it.
 *
 * `view.remove()` drops the view from its model's view list and unbinds every
 * model listener. The model, its comm and any other view of it survive — which
 * is what makes the same widget renderable inline and in the dock at once.
 */
function detachWidget(view) {
  if (!view) {
    return;
  }
  try {
    const panel = view.luminoWidget || view.pWidget;
    const runtime = panel && view.el?.isConnected ? lumino() : null;
    if (runtime) {
      runtime.MessageLoop.sendMessage(panel, runtime.Widget.Msg.BeforeDetach);
      view.el.remove();
      runtime.MessageLoop.sendMessage(panel, runtime.Widget.Msg.AfterDetach);
    } else {
      view.el?.remove();
    }
    view.remove();
  } catch (error) {
    console.error("[jupyter-repl] Failed to dispose a widget view:", error);
  }
}

class WidgetView {
  constructor(props) {
    this.props = props;
    this.view = null;
    this.error = null;
    this.destroyed = false;
    // Which mount attempt is current. A superseded one must not adopt the view
    // it built — unlike a superseded LaTeX render, which only throws away a
    // string, this one holds a live object bound to a model.
    this.renderToken = 0;
    etch.initialize(this);
    this.mountWidget();
  }

  render() {
    // The root keeps its identity across every state: an enclosing etch tree
    // records it, and this component re-renders on its own schedule — possibly
    // driven by another package's copy of etch — so a root swap would leave
    // that tree pointing at a removed node. All three states share one root and
    // differ only in the child. Nothing here uses innerHTML, so the
    // children-before-props ordering trap does not apply; view.el is appended
    // by hand into a host that has no vnode children of its own.
    return (
      <div className="output-widget">
        {this.error ? (
          <div className="output-widget-error">
            <span className="output-widget-message">{this.error}</span>
            {this.props.fallback ? <pre className="output-text">{this.props.fallback}</pre> : null}
          </div>
        ) : this.view ? (
          <div className="output-widget-host" ref="host" />
        ) : (
          <div className="output-widget-loading">
            <span>Loading widget…</span>
          </div>
        )}
      </div>
    );
  }

  async mountWidget() {
    const token = ++this.renderToken;
    // Whatever was here belongs to a superseded model; it goes now, not when
    // the new view is ready.
    this.teardownView();
    this.error = null;

    const { modelId, manager } = this.props;
    if (!modelId) {
      this.error = "This output names no widget.";
    } else if (!manager) {
      this.error = "The kernel that owns this widget is gone.";
    }
    if (this.error) {
      return etch.update(this);
    }

    // Not awaited: the loading state is for the user and nothing below depends
    // on it, and etch coalesces it with the update after this resolves.
    etch.update(this);

    let view = null;
    try {
      const model = await manager.get_model(modelId);
      if (this.destroyed || token !== this.renderToken) {
        return;
      }
      view = await manager.create_view(model);
    } catch (error) {
      if (this.destroyed || token !== this.renderToken) {
        return;
      }
      this.view = null;
      this.error = error?.message || String(error);
    }

    if (this.destroyed || token !== this.renderToken) {
      // Superseded or destroyed while the view was being built. It exists and
      // nothing will ever mount it, and the model holds it until told
      // otherwise — this is the one place a view is created and not adopted.
      detachWidget(view);
      return;
    }
    this.view = view;

    await etch.update(this);
    // etch.update resolves on a later frame, and a destroy can land inside it.
    if (this.destroyed || token !== this.renderToken) {
      this.teardownView();
      return;
    }
    attachWidget(this.view, this.refs.host);
  }

  update(props) {
    const previous = this.props;
    this.props = props;
    // Same widget, same kernel: nothing to do. Without this the live view would
    // be torn down and rebuilt on every keystroke that moves the marker, since
    // updatePosition emits on the store like any other change. The manager is
    // compared too — a restart replaces it while model ids can repeat.
    if (props.modelId === previous.modelId && props.manager === previous.manager) {
      return Promise.resolve();
    }
    // The history slider scrubbed to another output. That path renders with no
    // key and no wrapper, so etch keeps this instance and hands it a different
    // payload: one component asked to switch models.
    return this.mountWidget();
  }

  teardownView() {
    if (this.view) {
      detachWidget(this.view);
      this.view = null;
    }
  }

  destroy() {
    // First, so an in-flight mount abandons the view it is building.
    this.destroyed = true;
    this.teardownView();
    return etch.destroySync(this);
  }
}

/**
 * Render `application/vnd.jupyter.widget-view+json`.
 *
 * Declines when the bundle names a model nothing owns — a notebook opened
 * without a kernel, or a kernel that has since died. The bundle virtually
 * always carries the repr the kernel sent alongside, so declining shows that
 * rather than an error where a value should be.
 */
const widgetRenderer = (data, metadata, bundle) => {
  const modelId = data && data.model_id;
  const manager = modelId ? managerForModelId(modelId) : null;
  if (modelId && !manager) {
    return null;
  }
  // Function-body, and idempotent: the widget stylesheets are five thousand
  // lines and no window should read them until a widget is actually rendered.
  require("./widget-styles").ensureWidgetStyles();
  return (
    <WidgetView modelId={modelId} manager={manager} fallback={bundle && bundle["text/plain"]} />
  );
};

module.exports = { WidgetView, widgetRenderer, attachWidget, detachWidget };
