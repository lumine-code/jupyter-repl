const { IsolatedFrame } = require("./components/result-view/isolated-frame");
const { anywidgetRuntime } = require("./anywidget-runtime");

const ANYWIDGET_MODULE = "anywidget";
const ANYWIDGET_VERSION = "0.11.0";
const SCRIPT = `(${anywidgetRuntime.toString()})();`;
const RESERVED = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "_esm",
  "_css",
  "_anywidget_id",
]);

function canWriteTrait(model, key) {
  return (
    typeof key === "string" &&
    Object.prototype.hasOwnProperty.call(model.attributes, key) &&
    !RESERVED.has(key) &&
    !/^_(model|view)_/.test(key)
  );
}

function references(state, id) {
  if (typeof state === "string") return state === `anywidget:${id}` || state === `IPY_MODEL_${id}`;
  if (
    !state ||
    typeof state !== "object" ||
    ArrayBuffer.isView(state) ||
    state instanceof ArrayBuffer
  )
    return false;
  return Object.values(state).some((value) => references(value, id));
}

function validBuffers(buffers) {
  return (
    Array.isArray(buffers) &&
    buffers.length <= 1024 &&
    buffers.every((value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value))
  );
}

// Jupyter's default JSON serializer discards DataView contents. AFM traits may
// contain binary anywhere, and layout/style are real WidgetModels internally:
// preserve buffers and encode model references before crossing the sandbox.
function toWire(value) {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value == null) return value;
  if (value.model_id && typeof value.get_state === "function") return `IPY_MODEL_${value.model_id}`;
  if (Array.isArray(value)) return value.map(toWire);
  if (typeof value === "object") {
    const result = Object.create(null);
    for (const [key, child] of Object.entries(value)) result[key] = toWire(child);
    return result;
  }
  return value;
}

function stateOf(model) {
  return toWire(model.get_state(false));
}

function validData(value, binary = false, ancestors = new Set()) {
  if (value == null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (binary && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return true;
  if (typeof value !== "object" || ancestors.size > 64 || ancestors.has(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((child) => validData(child, binary, ancestors));
  ancestors.delete(value);
  return valid;
}

function createAnywidgetModule(base) {
  class AnyModel extends base.DOMWidgetModel {
    defaults() {
      return {
        ...super.defaults(),
        _model_name: "AnyModel",
        _view_name: "AnyView",
        _model_module: ANYWIDGET_MODULE,
        _view_module: ANYWIDGET_MODULE,
        _model_module_version: ANYWIDGET_VERSION,
        _view_module_version: ANYWIDGET_VERSION,
        _esm: "",
        _css: "",
      };
    }

    serialize(state) {
      const result = Object.create(null);
      for (const [key, value] of Object.entries(state)) {
        const serializer = this.constructor.serializers?.[key]?.serialize;
        result[key] = toWire(serializer ? serializer(value, this) : value);
      }
      return result;
    }
  }

  class AnyView extends base.DOMWidgetView {
    render() {
      super.render();
      this.el.classList.add("jupyter-widgets", "output-anywidget");
      this._models = new Map();
      this._generation = 0;
      this._removed = false;
      this._watch(this.model);
      this._mount();
      return this;
    }

    _watch(model) {
      if (this._models.has(model.model_id)) return;
      this._models.set(model.model_id, model);
      this.listenTo(model, "change", () => {
        if (model.changed?._esm !== undefined || model.changed?._css !== undefined) {
          this._mount();
        } else {
          this.frame?.postMessage({
            type: "anywidget-state",
            id: model.model_id,
            state: stateOf(model),
          });
        }
      });
      this.listenTo(model, "msg:custom", (content, buffers) => {
        this.frame?.postMessage({
          type: "anywidget-custom",
          id: model.model_id,
          content,
          buffers: buffers || [],
        });
      });
      if (model !== this.model) {
        this.listenTo(model, "destroy", () => {
          this.frame?.postMessage({ type: "anywidget-close", id: model.model_id });
          this.stopListening(model);
          this._models.delete(model.model_id);
        });
      }
    }

    async _mount() {
      if (this._removed) return;
      const generation = ++this._generation;
      if (this.frame) await this.frame.destroy();
      if (generation !== this._generation || this._removed) return;
      this.el.replaceChildren();
      this.frame = new IsolatedFrame({
        html: '<div id="anywidget-root"></div>',
        script: SCRIPT,
        title: "anywidget output",
        onReady: (frame) => {
          if (generation !== this._generation || this._removed) return;
          frame.postMessage({
            type: "anywidget-start",
            id: this.model.model_id,
            state: stateOf(this.model),
            live: Boolean(this.model.comm_live),
          });
        },
        onMessage: (data) => this._receive(data, generation),
        onError: (message) => this._showError(message, generation),
      });
      this.el.appendChild(this.frame.element);
    }

    _showError(message, generation) {
      if (generation !== this._generation || this._removed) return;
      let error = this.el.querySelector(".output-widget-error");
      if (!error) {
        error = document.createElement("pre");
        error.className = "output-widget-error";
        this.el.appendChild(error);
      }
      error.textContent = message;
    }

    async _receive(data, generation) {
      if (generation !== this._generation || this._removed || !data || typeof data !== "object")
        return;
      const model = this._models.get(data.id);
      if (data.type === "anywidget-get-model") {
        try {
          if (typeof data.ref !== "string" || typeof data.request !== "number")
            throw new Error("Invalid child widget reference.");
          const match = /^(?:anywidget:|IPY_MODEL_)(.+)$/.exec(data.ref);
          const id = match?.[1];
          if (!id || ![...this._models.values()].some((entry) => references(stateOf(entry), id))) {
            throw new Error("The child widget is not referenced by this output.");
          }
          const child = await this.model.widget_manager.get_model(id);
          if (generation !== this._generation || this._removed) return;
          if (child.get("_model_module") !== ANYWIDGET_MODULE)
            throw new Error(
              "Only anywidget children can be composed in an isolated anywidget output.",
            );
          this._watch(child);
          this.frame.postMessage({
            type: "anywidget-model",
            request: data.request,
            id,
            state: stateOf(child),
            live: Boolean(child.comm_live),
          });
        } catch (error) {
          if (generation === this._generation && !this._removed)
            this.frame.postMessage({
              type: "anywidget-model",
              request: data.request,
              error: error.message,
            });
        }
        return;
      }
      if (!model) return;
      if (
        !model.comm_live &&
        ["anywidget-set", "anywidget-save", "anywidget-send"].includes(data.type)
      ) {
        this._showError("This saved widget has no live kernel connection.", generation);
        return;
      }
      try {
        if (data.type === "anywidget-set") {
          if (!canWriteTrait(model, data.key))
            throw new Error("This widget trait cannot be changed.");
          if (!validData(data.value, true)) throw new Error("Invalid widget trait data.");
          model.set(data.key, data.value);
        } else if (data.type === "anywidget-save") {
          model.save_changes();
        } else if (data.type === "anywidget-send") {
          if (!validData(data.content)) throw new Error("Invalid custom message data.");
          if (!validBuffers(data.buffers)) throw new Error("Invalid custom message buffers.");
          model.send(data.content, this.callbacks(), data.buffers);
        }
      } catch (error) {
        this._showError(error.message, generation);
      }
    }

    // The output component detaches view.el before Backbone removes the view.
    // Retire the sandbox while it is still connected, so its asynchronous AFM
    // cleanup can finish even when the enclosing output is removed immediately.
    prepareForDetach() {
      if (!this._removed) {
        this._removed = true;
        this._generation++;
      }
      return this.frame?.destroy();
    }

    remove() {
      this.prepareForDetach();
      this.frame = null;
      this._models?.clear();
      return super.remove();
    }
  }

  return { AnyModel, AnyView };
}

module.exports = {
  createAnywidgetModule,
  ANYWIDGET_MODULE,
  canWriteTrait,
  references,
  validBuffers,
};
