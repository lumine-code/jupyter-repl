// Runs only in the sandboxed, opaque-origin iframe; no CommonJS imports.
(() => {
  "use strict";
  const nonce = location.hash.slice(1);
  let port = null;
  let disposed = false;
  let disposing = false;
  let initialized = false;
  const listeners = new Set();
  const disposers = new Set();
  const urls = new Set();
  const output = document.getElementById("output");
  let resizePending = false;
  const send = (data) => {
    if (!disposed && port) port.postMessage(data);
  };
  const error = (reason) => {
    const message = String(reason?.message || reason || "The output failed.").slice(0, 4000);
    send({ type: "lumine-output-error", message });
    const el = document.createElement("pre");
    el.className = "output-error";
    el.textContent = message;
    output.appendChild(el);
  };
  const resize = () => {
    if (resizePending || disposed) return;
    resizePending = true;
    requestAnimationFrame(() => {
      resizePending = false;
      send({
        type: "lumine-output-resize",
        height: Math.max(24, output.scrollHeight, output.getBoundingClientRect().height),
      });
    });
  };
  const observer = new ResizeObserver(resize);
  observer.observe(output);
  window.addEventListener("error", (event) => error(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => error(event.reason));
  const dispose = async () => {
    if (disposed || disposing) return;
    disposing = true;
    const pending = [];
    for (const callback of disposers) {
      try {
        pending.push(Promise.resolve(callback()));
      } catch {}
    }
    await Promise.allSettled(pending);
    send({ type: "lumine-output-disposed" });
    disposed = true;
    observer.disconnect();
    listeners.clear();
    disposers.clear();
    for (const url of urls) URL.revokeObjectURL(url);
    urls.clear();
    port?.close();
    port = null;
  };
  window.addEventListener("pagehide", dispose, { once: true });
  window.lumineOutput = Object.freeze({
    send,
    onMessage(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    onDispose(callback) {
      disposers.add(callback);
      return () => disposers.delete(callback);
    },
    resize,
  });
  async function initialize(data) {
    if (initialized) return;
    initialized = true;
    output.innerHTML = String(data.html || "");
    // innerHTML leaves scripts inert. Execute them deliberately, in document
    // order, inside this iframe only; retain JSON script tags as data.
    for (const previous of [...output.querySelectorAll("script")]) {
      if (
        previous.type &&
        !["module", "text/javascript", "application/javascript"].includes(previous.type)
      )
        continue;
      const script = document.createElement("script");
      if (previous.type) script.type = previous.type;
      if (previous.src) {
        const src = new URL(previous.getAttribute("src"));
        if (src.protocol !== "https:") throw new Error("Output scripts must use HTTPS.");
        script.src = src.href;
        const loaded = new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error(`Could not load ${src.href}`));
        });
        previous.replaceWith(script);
        await loaded;
      } else {
        script.textContent = previous.textContent;
        if (script.type === "module") {
          const loaded = new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error("Could not load an output module."));
          });
          previous.replaceWith(script);
          await loaded;
        } else previous.replaceWith(script);
      }
    }
    if (data.script) {
      const url = URL.createObjectURL(new Blob([String(data.script)], { type: "text/javascript" }));
      urls.add(url);
      const script = document.createElement("script");
      script.src = url;
      const loaded = new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = () => reject(new Error("Could not start the output renderer."));
      });
      document.body.appendChild(script);
      await loaded;
    }
    send({ type: "lumine-output-ready" });
    resize();
  }
  function connect(event) {
    if (
      event.source !== window.parent ||
      event.data?.type !== "lumine-output-port" ||
      event.data.nonce !== nonce ||
      port ||
      event.ports.length !== 1
    )
      return;
    window.removeEventListener("message", connect);
    port = event.ports[0];
    port.onmessage = (message) => {
      const data = message.data;
      if (data?.type === "lumine-output-dispose") return dispose();
      if (data?.type === "lumine-output-init") {
        initialize(data).catch(error);
        return;
      }
      for (const callback of listeners) {
        try {
          Promise.resolve(callback(data)).catch(error);
        } catch (reason) {
          error(reason);
        }
      }
    };
    port.start();
  }
  window.addEventListener("message", connect);
  window.parent.postMessage({ type: "lumine-output-connect", nonce }, "*");
})();
