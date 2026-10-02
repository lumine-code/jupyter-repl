const etch = require("@lumine-code/etch");
const { randomBytes } = require("crypto");
const { pathToFileURL } = require("url");
const path = require("path");

// A local document is deliberate: srcdoc inherits the editor's CSP, which
// correctly prohibits notebook-supplied scripts in the Node-enabled parent.
// The child owns a separate CSP and an opaque origin, and receives all dynamic
// content through a private MessagePort. Never add allow-same-origin here.
const FRAME_URL = pathToFileURL(path.join(__dirname, "isolated-frame.html")).href;
const MAX_HEIGHT = 2400;

class IsolatedFrame {
  constructor(props) {
    this.props = props;
    this.destroyed = false;
    this.port = null;
    this.nonce = randomBytes(24).toString("hex");
    this.height = Math.max(24, Math.min(MAX_HEIGHT, Number(props.minHeight) || 24));
    this._onWindowMessage = (event) => this._connect(event);
    window.addEventListener("message", this._onWindowMessage);
    etch.initialize(this);
    this._readyTimeout = setTimeout(() => {
      if (!this.port && !this.destroyed) {
        this.props.onError?.("The isolated output renderer did not start.");
      }
    }, 15000);
  }

  render() {
    return etch.dom.div(
      { className: "output-isolated" },
      etch.dom.iframe({
        className: "output-isolated-frame",
        ref: "frame",
        src: `${FRAME_URL}#${this.nonce}`,
        sandbox: "allow-scripts",
        referrerPolicy: "no-referrer",
        title: this.props.title || "Interactive notebook output",
        style: { width: "100%", height: `${this.height}px`, border: "0", display: "block" },
      }),
    );
  }

  _connect(event) {
    if (
      this.destroyed ||
      this.port ||
      event.source !== this.refs.frame?.contentWindow ||
      event.origin !== "null" ||
      event.data?.type !== "lumine-output-connect" ||
      event.data.nonce !== this.nonce
    ) {
      return;
    }
    window.removeEventListener("message", this._onWindowMessage);
    clearTimeout(this._readyTimeout);
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (message) => this._receive(message.data);
    this.port.start();
    event.source.postMessage({ type: "lumine-output-port", nonce: this.nonce }, "*", [
      channel.port2,
    ]);
    this.postMessage({
      type: "lumine-output-init",
      html: String(this.props.html || ""),
      script: String(this.props.script || ""),
    });
  }

  _receive(data) {
    if (data?.type === "lumine-output-disposed" && this.destroyed) {
      this._finishDisposal?.();
      return;
    }
    if (this.destroyed || !data || typeof data !== "object") return;
    if (data.type === "lumine-output-ready") {
      this.props.onReady?.(this);
    } else if (data.type === "lumine-output-resize") {
      const height = Number(data.height);
      if (!Number.isFinite(height)) return;
      const min = Math.max(24, Math.min(MAX_HEIGHT, Number(this.props.minHeight) || 24));
      const max = Math.max(min, Math.min(MAX_HEIGHT, Number(this.props.maxHeight) || MAX_HEIGHT));
      this.height = Math.max(min, Math.min(max, Math.ceil(height)));
      if (this.refs.frame) this.refs.frame.style.height = `${this.height}px`;
    } else if (data.type === "lumine-output-error") {
      this.props.onError?.(String(data.message || "The isolated output failed.").slice(0, 4000));
    } else {
      this.props.onMessage?.(data, this);
    }
  }

  postMessage(data) {
    if (this.destroyed || !this.port) return false;
    try {
      // Do not transfer buffers: widget state and other views still own them.
      this.port.postMessage(data);
      return true;
    } catch (error) {
      this.props.onError?.(error.message);
      return false;
    }
  }

  update(props) {
    // Updating callbacks never reloads a live plot/widget. Its owner replaces
    // the component when the source changes, and can post model state freely.
    this.props = props;
    return Promise.resolve();
  }

  destroy() {
    if (this.destroyed) return this._disposal;
    this.postMessage({ type: "lumine-output-dispose" });
    this.destroyed = true;
    clearTimeout(this._readyTimeout);
    window.removeEventListener("message", this._onWindowMessage);
    const frame = this.refs.frame;
    // Removing an iframe immediately can stop it before AFM cleanup runs.
    // Atomic move preserves its browsing context while its old host is torn
    // down. The acknowledgement (or bounded timeout) removes the retired frame.
    const retain =
      this.port && frame?.isConnected && typeof document.body.moveBefore === "function";
    if (retain) {
      frame.style.display = "none";
      document.body.moveBefore(frame, null);
    }
    this._disposal = new Promise((resolve) => {
      let timeout;
      this._finishDisposal = () => {
        clearTimeout(timeout);
        if (this.port) {
          this.port.onmessage = null;
          this.port.close();
          this.port = null;
        }
        if (retain) frame.remove();
        this._finishDisposal = null;
        resolve();
      };
      if (retain) timeout = setTimeout(() => this._finishDisposal?.(), 1000);
      else this._finishDisposal();
    });
    etch.destroySync(this);
    return this._disposal;
  }
}

module.exports = { IsolatedFrame, FRAME_URL, MAX_HEIGHT };
