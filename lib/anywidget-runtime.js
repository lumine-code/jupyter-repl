// Stringified by anywidget.js and executed exclusively in IsolatedFrame.
function anywidgetRuntime() {
  "use strict";
  const bridge = window.lumineOutput;
  const models = new Map();
  const instances = new Map();
  const requests = new Map();
  const controllers = new Set();
  const moduleUrls = new Set();
  const styles = new Map();
  const cleanupJobs = new Set();
  let nextRequest = 0;
  let disposed = false;

  function equal(left, right) {
    if (Object.is(left, right)) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
    if (ArrayBuffer.isView(left) || left instanceof ArrayBuffer) {
      if (!(ArrayBuffer.isView(right) || right instanceof ArrayBuffer)) return false;
      const bytes = (value) =>
        new Uint8Array(value.buffer || value, value.byteOffset || 0, value.byteLength);
      const a = bytes(left),
        b = bytes(right);
      return a.length === b.length && a.every((value, index) => value === b[index]);
    }
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every(
        (key) => Object.prototype.hasOwnProperty.call(right, key) && equal(left[key], right[key]),
      )
    );
  }

  function createModel(id, state, live) {
    const attributes = Object.assign(Object.create(null), state);
    const events = new Map();
    const emit = (name, ...args) => {
      for (const callback of [...(events.get(name) || [])]) callback(...args);
    };
    const model = {
      get(key) {
        return attributes[key];
      },
      set(key, value) {
        if (disposed) return;
        if (!live) throw new Error("This saved widget has no live kernel connection.");
        if (
          typeof key !== "string" ||
          !Object.prototype.hasOwnProperty.call(attributes, key) ||
          ["__proto__", "constructor", "prototype", "_esm", "_css", "_anywidget_id"].includes(
            key,
          ) ||
          /^_(model|view)_/.test(key)
        )
          throw new Error("This widget trait cannot be changed.");
        if (!equal(attributes[key], value)) {
          attributes[key] = value;
          emit(`change:${key}`);
          emit("change");
        }
        bridge.send({ type: "anywidget-set", id, key, value });
      },
      on(name, callback) {
        if (typeof callback !== "function") return;
        for (const event of String(name).split(/\s+/)) {
          if (!events.has(event)) events.set(event, new Set());
          events.get(event).add(callback);
        }
      },
      off(name, callback) {
        if (name == null) {
          if (callback == null) events.clear();
          else for (const set of events.values()) set.delete(callback);
          return;
        }
        for (const event of String(name).split(/\s+/)) {
          if (callback == null) events.delete(event);
          else events.get(event)?.delete(callback);
        }
      },
      save_changes() {
        if (!live) throw new Error("This saved widget has no live kernel connection.");
        bridge.send({ type: "anywidget-save", id });
      },
      send(content, _callbacks, buffers = []) {
        if (!live) throw new Error("This saved widget has no live kernel connection.");
        bridge.send({ type: "anywidget-send", id, content, buffers });
      },
    };
    const update = (next) => {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (equal(attributes[key], value)) continue;
        attributes[key] = value;
        emit(`change:${key}`);
        changed = true;
      }
      if (changed) emit("change");
    };
    const custom = (content, buffers) =>
      emit(
        "msg:custom",
        content,
        (buffers || []).map((value) =>
          value instanceof DataView
            ? value
            : new DataView(value.buffer || value, value.byteOffset || 0, value.byteLength),
        ),
      );
    const entry = { id, model, update, custom, destroy: () => events.clear() };
    models.set(id, entry);
    return entry;
  }

  function controller(parent) {
    const value = new AbortController();
    controllers.add(value);
    if (parent?.aborted) value.abort();
    else
      parent?.addEventListener("abort", () => value.abort(), { once: true, signal: value.signal });
    value.signal.addEventListener("abort", () => controllers.delete(value), { once: true });
    return value;
  }

  function cleanup(result, signal) {
    if (typeof result !== "function") return;
    const run = () => {
      try {
        const task = Promise.resolve(result()).catch(report);
        cleanupJobs.add(task);
        task.finally(() => cleanupJobs.delete(task));
      } catch (error) {
        report(error);
      }
    };
    if (signal.aborted) run();
    else signal.addEventListener("abort", run, { once: true });
  }

  function report(reason) {
    bridge.send({ type: "lumine-output-error", message: String(reason?.message || reason) });
  }

  function css(id, value) {
    styles.get(id)?.remove();
    if (!value) return;
    const text = String(value);
    let element;
    if (/^https:\/\//.test(text.trim())) {
      element = document.createElement("link");
      element.rel = "stylesheet";
      element.href = text.trim();
    } else {
      if (/^(?:http|file|data|javascript):/i.test(text.trim()))
        throw new Error("Widget stylesheets must use HTTPS.");
      element = document.createElement("style");
      element.textContent = text;
    }
    document.head.appendChild(element);
    styles.set(id, element);
  }

  async function initialize(entry) {
    if (instances.has(entry.id)) return instances.get(entry.id);
    const task = (async () => {
      const lifetime = controller();
      const model = entry.model;
      const esm = String(model.get("_esm") || "");
      let url;
      if (/^https:\/\//.test(esm.trim())) url = esm.trim();
      else {
        if (/^(?:http|file|data|javascript):/i.test(esm.trim()))
          throw new Error("Widget modules must use HTTPS or inline ESM.");
        url = URL.createObjectURL(new Blob([esm], { type: "text/javascript" }));
        moduleUrls.add(url);
      }
      try {
        css(entry.id, model.get("_css"));
        const module = await import(url);
        if (disposed) {
          lifetime.abort();
          throw new Error("The widget was removed.");
        }
        const widget =
          typeof module.default === "function" ? await module.default() : module.default || module;
        if (!widget || typeof widget !== "object")
          throw new Error("The widget module must export a widget interface.");
        const exports = widget.initialize
          ? await widget.initialize({ model, signal: lifetime.signal })
          : undefined;
        cleanup(exports, lifetime.signal);
        if (disposed || lifetime.signal.aborted) throw new Error("The widget was removed.");
        return {
          widget,
          exports: typeof exports === "object" && exports !== null ? exports : undefined,
          lifetime,
        };
      } catch (error) {
        lifetime.abort();
        throw error;
      }
    })();
    instances.set(entry.id, task);
    return task;
  }

  async function getModel(ref) {
    if (typeof ref !== "string" || !/^(?:anywidget:|IPY_MODEL_).+/.test(ref))
      throw new Error("Invalid child widget reference.");
    const id = ref.replace(/^(?:anywidget:|IPY_MODEL_)/, "");
    if (models.has(id)) return models.get(id);
    const request = ++nextRequest;
    const result = new Promise((resolve, reject) => requests.set(request, { resolve, reject }));
    bridge.send({ type: "anywidget-get-model", ref, request });
    return result;
  }

  async function render(entry, el, signal) {
    const initialized = await initialize(entry);
    const view = controller(initialized.lifetime.signal);
    if (signal?.aborted) view.abort();
    else signal?.addEventListener("abort", () => view.abort(), { once: true, signal: view.signal });
    if (view.signal.aborted || disposed) return;
    const host = {
      async getModel(ref) {
        return (await getModel(ref)).model;
      },
      async getWidget(ref) {
        const child = await getModel(ref);
        const value = await initialize(child);
        return {
          exports: value.exports,
          render: ({ el: target, signal: childSignal }) =>
            render(child, target, childSignal || view.signal),
        };
      },
    };
    try {
      const result = initialized.widget.render
        ? await initialized.widget.render({ model: entry.model, el, signal: view.signal, host })
        : undefined;
      cleanup(result, view.signal);
      bridge.resize();
    } catch (error) {
      view.abort();
      throw error;
    }
  }

  bridge.onMessage(async (data) => {
    if (disposed || !data) return;
    if (data.type === "anywidget-start") {
      const entry = createModel(data.id, data.state, data.live);
      await render(entry, document.getElementById("anywidget-root"));
      bridge.send({ type: "anywidget-rendered", id: data.id });
    } else if (data.type === "anywidget-state") {
      models.get(data.id)?.update(data.state);
    } else if (data.type === "anywidget-custom") {
      models.get(data.id)?.custom(data.content, data.buffers);
    } else if (data.type === "anywidget-model") {
      const request = requests.get(data.request);
      if (!request) return;
      requests.delete(data.request);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(models.get(data.id) || createModel(data.id, data.state, data.live));
    } else if (data.type === "anywidget-close") {
      const initialized = instances.get(data.id);
      instances.delete(data.id);
      initialized?.then((value) => value.lifetime.abort()).catch(() => {});
      models.get(data.id)?.destroy();
      models.delete(data.id);
    }
  });
  bridge.onDispose(() => {
    disposed = true;
    for (const value of [...controllers]) value.abort();
    for (const entry of models.values()) entry.destroy();
    for (const request of requests.values()) request.reject(new Error("The widget was removed."));
    for (const url of moduleUrls) URL.revokeObjectURL(url);
    for (const style of styles.values()) style.remove();
    models.clear();
    requests.clear();
    instances.clear();
    styles.clear();
    moduleUrls.clear();
    return Promise.allSettled([...cleanupJobs]);
  });
}

module.exports = { anywidgetRuntime };
