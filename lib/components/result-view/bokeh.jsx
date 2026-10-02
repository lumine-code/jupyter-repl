/** @jsx etch.dom */
const etch = require("@lumine-code/etch");

const BOKEH_LOAD = "application/vnd.bokehjs_load.v0+json";
const BOKEH_EXEC = "application/vnd.bokehjs_exec.v0+json";
const PANEL_LOAD = "application/vnd.holoviews_load.v0+json";
const PANEL_EXEC = "application/vnd.holoviews_exec.v0+json";
const loads = new WeakMap();

function text(value) {
  return typeof value === "string" ? value : Array.isArray(value) ? value.join("") : "";
}

function samePlot(left, right) {
  const previous = left.loadCode || [];
  const next = right.loadCode || [];
  return (
    left.kernel === right.kernel &&
    left.panel === right.panel &&
    text(left.bundle["text/html"]) === text(right.bundle["text/html"]) &&
    text(left.bundle["application/javascript"]) === text(right.bundle["application/javascript"]) &&
    left.metadata?.id === right.metadata?.id &&
    left.metadata?.server_id === right.metadata?.server_id &&
    previous.length === next.length &&
    previous.every((code, index) => code === next[index])
  );
}

// The source below runs only in the opaque-origin output document. Nothing
// from a kernel is ever evaluated or inserted as executable HTML in the editor.
function isolatedBokeh(payload) {
  const bridge = window.lumineOutput;
  const comms = new Map();
  const targets = new Map();
  const resources = new Set();
  const root = document.getElementById("rich-output");
  const send = (data) => bridge.send({ type: "plot-comm", ...data });
  function comm(id) {
    if (comms.has(id)) return comms.get(id);
    const handlers = {};
    const channel = {
      comm_id: id,
      send(data, callbacks, metadata, buffers) {
        send({ operation: "send", id, data, metadata, buffers });
      },
      close(data) {
        send({ operation: "close", id, data });
        comms.delete(id);
      },
      on_msg(callback) {
        handlers.msg = callback;
      },
      on_close(callback) {
        handlers.close = callback;
      },
    };
    comms.set(id, { channel, handlers });
    return { channel, handlers };
  }
  window.Jupyter = {
    notebook: {
      kernel: {
        id: payload.kernelId,
        comm_manager: {
          new_comm(target, data, callbacks, metadata, id = crypto.randomUUID(), buffers) {
            const entry = comm(id);
            send({ operation: "open", id, target, data, metadata, buffers });
            return entry.channel;
          },
          register_target(target, callback) {
            targets.set(target, callback);
            send({ operation: "register", target });
          },
        },
      },
    },
  };
  bridge.onMessage((data) => {
    if (data?.type !== "plot-comm-event") return;
    const entry = comm(data.id);
    if (data.operation === "open") targets.get(data.target)?.(entry.channel, data.message);
    else if (data.operation === "message") entry.handlers.msg?.(data.message);
    else if (data.operation === "close") {
      entry.handlers.close?.(data.message);
      comms.delete(data.id);
    }
  });
  async function script(src, code) {
    if (src && resources.has(src)) return;
    const element = document.createElement("script");
    element.async = false;
    const loaded = new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => reject(new Error(`Could not load ${src || "plot resources"}`));
    });
    let url;
    if (src) {
      const parsed = new URL(src);
      if (parsed.protocol !== "https:") throw new Error("Plot resources must use HTTPS.");
      element.src = parsed.href;
    } else {
      url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      element.src = url;
    }
    document.head.appendChild(element);
    try {
      await loaded;
      if (src) resources.add(src);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  async function html(source) {
    const holder = document.createElement("div");
    holder.innerHTML = source;
    const scripts = [...holder.querySelectorAll("script")];
    root.appendChild(holder);
    for (const element of scripts) {
      if (
        element.type &&
        !["text/javascript", "application/javascript", "module"].includes(element.type)
      )
        continue;
      // Retain the original position and ID for scripts that inspect siblings.
      const replacement = document.createElement("script");
      for (const attribute of element.attributes)
        replacement.setAttribute(attribute.name, attribute.value);
      if (element.src) {
        const parsed = new URL(element.getAttribute("src"));
        if (parsed.protocol !== "https:") throw new Error("Plot scripts must use HTTPS.");
        const loaded = new Promise((resolve, reject) => {
          replacement.onload = resolve;
          replacement.onerror = () => reject(new Error(`Could not load ${parsed.href}`));
        });
        replacement.src = parsed.href;
        element.replaceWith(replacement);
        await loaded;
      } else {
        replacement.textContent = element.textContent;
        element.replaceWith(replacement);
      }
    }
  }
  async function render() {
    for (const code of payload.loads) await script(null, code);
    const all = `${payload.html}\n${payload.code}`;
    const version = all.match(/"version"\s*:\s*"([0-9][0-9a-z.+-]*)"/)?.[1];
    if (!window.Bokeh && version) {
      const normalized = version.replace("rc", "-rc.").replace(".dev", "-dev.");
      for (const suffix of ["", "-widgets", "-tables", "-gl", "-mathjax"]) {
        await script(`https://cdn.bokeh.org/bokeh/release/bokeh${suffix}-${normalized}.min.js`);
      }
    }
    if (payload.panel) {
      window.PyViz ??= {};
      for (const key of ["comms", "comm_status", "kernels", "receivers", "plot_index"])
        window.PyViz[key] ??= {};
      const dist = all.match(/https:\/\/cdn\.holoviz\.org\/panel\/[0-9a-z.+-]+\/dist\//)?.[0];
      if (!window.Bokeh?.Panel && dist) await script(`${dist}panel.min.js`);
    }
    if (payload.html) await html(payload.html);
    if (payload.code) await script(null, payload.code);
    bridge.resize();
    bridge.send({ type: "plot-rendered", bokehVersion: window.Bokeh?.version });
  }
  bridge.onDispose(() => {
    for (const entry of comms.values()) entry.handlers.close?.({ content: {} });
    comms.clear();
    targets.clear();
    for (const view of Object.values(window.Bokeh?.index || {})) view?.remove?.();
  });
  render().catch((error) => {
    bridge.send({ type: "lumine-output-error", message: error.message });
  });
}

class BokehView {
  constructor(props) {
    this.props = props;
    this.error = null;
    this.comms = new Map();
    this.targets = new Map();
    this.frame = null;
    this.destroyed = false;
    etch.initialize(this);
    this.mount();
  }

  render() {
    return (
      <div className="output-bokeh" data-context-menu-boundary="true">
        <div ref="host" />
        {this.error ? <pre className="output-widget-error">{this.error}</pre> : null}
      </div>
    );
  }

  mount() {
    const { IsolatedFrame } = require("./isolated-frame");
    const { bundle, panel, kernel, loadCode } = this.props;
    const payload = {
      html: text(bundle["text/html"]),
      code: text(bundle["application/javascript"]),
      loads: loadCode || [],
      panel,
      kernelId: kernel?.id || "",
    };
    // Comm targets are restricted to names minted in this output, plus Bokeh's
    // documented notebook target. No execute_request or filesystem API exists.
    this.allowedTargets = new Set(["bokeh"]);
    const literals = `${payload.html}\n${payload.code}\n${payload.loads.join("\n")}`;
    for (const match of literals.matchAll(/["']([a-zA-Z0-9_.:-]{1,128})["']/g))
      this.allowedTargets.add(match[1]);
    this.frame = new IsolatedFrame({
      html: '<div id="rich-output"></div>',
      script: `(${isolatedBokeh.toString()})(${JSON.stringify(payload)});`,
      title: panel ? "Panel output" : "Bokeh output",
      onMessage: (data) => this.receive(data),
      onError: (message) => this.fail(message),
    });
    this.refs.host.appendChild(this.frame.element);
    this.resetSubscription = kernel?.transport?.onDidResetComms?.(() => {
      this.disposeComms();
      this.fail("The kernel session changed. Run this plot again to reconnect its controls.");
    });
  }

  fail(message) {
    if (this.destroyed) return;
    this.error = String(message).slice(0, 4000);
    etch.update(this);
  }

  bind(channel) {
    if (this.comms.has(channel.comm_id)) return;
    this.comms.set(channel.comm_id, channel);
    channel.on_msg((message) =>
      this.frame?.postMessage({
        type: "plot-comm-event",
        operation: "message",
        id: channel.comm_id,
        message,
      }),
    );
    channel.on_close((message) => {
      this.frame?.postMessage({
        type: "plot-comm-event",
        operation: "close",
        id: channel.comm_id,
        message,
      });
      this.comms.delete(channel.comm_id);
    });
  }

  receive(data) {
    if (data?.type !== "plot-comm") return;
    const transport = this.props.kernel?.transport;
    if (!transport) {
      this.fail("This stored plot has no live kernel. Python callbacks are unavailable.");
      return;
    }
    try {
      if (data.operation === "register" || data.operation === "open") {
        if (!this.allowedTargets.has(data.target))
          throw new Error("The plot requested an unrelated comm target.");
      }
      if (data.operation === "register") {
        if (this.targets.has(data.target)) return;
        const subscription = transport.registerCommTarget(data.target, (channel, message) => {
          this.bind(channel);
          this.frame?.postMessage({
            type: "plot-comm-event",
            operation: "open",
            id: channel.comm_id,
            target: data.target,
            message,
          });
        });
        this.targets.set(data.target, subscription);
      } else if (data.operation === "open") {
        if (typeof data.id !== "string" || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(data.id))
          throw new Error("Invalid plot comm ID.");
        if (this.comms.has(data.id) || transport.getComm(data.id))
          throw new Error("The plot comm already exists.");
        const channel = transport.createComm(data.target, data.id);
        this.bind(channel);
        channel.open(data.data, undefined, data.metadata, data.buffers);
      } else {
        const channel = this.comms.get(data.id);
        if (!channel) throw new Error("The plot comm is not owned by this output.");
        if (data.operation === "send")
          channel.send(data.data, undefined, data.metadata, data.buffers);
        else if (data.operation === "close") {
          channel.close(data.data);
          this.comms.delete(data.id);
        }
      }
    } catch (error) {
      this.fail(error.message);
    }
  }

  disposeComms() {
    for (const subscription of this.targets.values()) subscription?.dispose?.();
    this.targets.clear();
    for (const channel of this.comms.values()) channel.close();
    this.comms.clear();
  }

  update(props) {
    if (samePlot(this.props, props)) {
      this.props = props;
      return Promise.resolve();
    }
    this.frame?.destroy();
    this.frame = null;
    this.resetSubscription?.dispose();
    this.disposeComms();
    this.props = props;
    this.error = null;
    this.mount();
    return etch.update(this);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resetSubscription?.dispose();
    this.disposeComms();
    const retiredFrame = this.frame?.destroy();
    this.frame = null;
    etch.destroySync(this);
    return Promise.resolve(retiredFrame);
  }
}

function bokehRenderer(mime) {
  return (data, metadata, bundle = {}, options = {}) => {
    const scope = options.kernel || options.outputScope;
    const panel = mime === PANEL_LOAD || mime === PANEL_EXEC;
    if (mime === BOKEH_LOAD || mime === PANEL_LOAD) {
      const code = text(data) || text(bundle["application/javascript"]);
      if (scope && code && code.length <= 8 * 1024 * 1024) {
        const current = loads.get(scope) || {};
        current[panel ? "panel" : "bokeh"] = code;
        loads.set(scope, current);
      }
      return <div className="output-resource-load" hidden={true} />;
    }
    if (!text(bundle["text/html"]) && !text(bundle["application/javascript"])) {
      return bundle["text/plain"] ? null : (
        <div className="output-bokeh-error">This plot contains no HTML or JavaScript output.</div>
      );
    }
    const resources = scope ? loads.get(scope) : null;
    const loadCode = [resources?.bokeh, ...(panel ? [resources?.panel] : [])].filter(Boolean);
    return (
      <BokehView
        bundle={bundle}
        metadata={metadata}
        panel={panel}
        kernel={options.kernel}
        loadCode={loadCode}
      />
    );
  };
}

module.exports = {
  BokehView,
  bokehRenderer,
  isolatedBokeh,
  BOKEH_LOAD,
  BOKEH_EXEC,
  PANEL_LOAD,
  PANEL_EXEC,
};
