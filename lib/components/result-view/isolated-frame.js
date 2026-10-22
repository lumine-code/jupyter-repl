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
// Changing only the fragment keeps the old document alive. A new query forces
// navigation, while the fragment authenticates its bootstrap message.
const frameURL = (nonce) => `${FRAME_URL}?connection=${nonce}#${nonce}`;

class IsolatedFrame {
  constructor(props) {
    this.props = props;
    this.destroyed = false;
    this.port = null;
    this.ready = false;
    this.requests = new Map();
    this.pendingMessages = [];
    this.nonce = randomBytes(24).toString("hex");
    this.height = Math.max(24, Math.min(MAX_HEIGHT, Number(props.minHeight) || 24));
    this._onWindowMessage = (event) => this._connect(event);
    etch.initialize(this);
    this.bindDocument(this.element.ownerDocument);
    this.windowParticipant = lumine.views.addWindowParticipant(this.element, this);
    this.keyboardHost = lumine.keymaps.registerFrameHost(this.element);
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
        src: frameURL(this.nonce),
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
    this.document.defaultView.removeEventListener("message", this._onWindowMessage);
    clearTimeout(this._readyTimeout);
    const channel = new MessageChannel();
    this.port = channel.port1;
    this.port.onmessage = (message) => this._receive(message.data);
    this.port.start();
    const window = lumine.workspace.getWindowForElement(this.element);
    window.postMessageToFrame(
      this.refs.frame,
      { type: "lumine-output-port", nonce: this.nonce },
      "*",
      [channel.port2],
    );
    this.postMessage({
      type: "lumine-output-init",
      html: String(this.props.html || ""),
      script: String(this.props.script || ""),
      checkpoint: this.pendingCheckpoint,
    });
  }

  _receive(data) {
    if (data?.type === "lumine-output-checkpoint-result") {
      const request = this.requests.get(data.requestId);
      if (!request) return;
      this.requests.delete(data.requestId);
      clearTimeout(request.timeout);
      if (data.error) request.reject(new Error(String(data.error)));
      else request.resolve(data.checkpoint);
      return;
    }
    if (data?.type === "lumine-output-disposed" && this.destroyed) {
      this._finishDisposal?.();
      return;
    }
    if (this.destroyed || !data || typeof data !== "object") return;
    if (data.type === "lumine-output-ready") {
      this.ready = true;
      this.windowChange?.resolve();
      this.props.onReady?.(this);
      for (const message of this.pendingMessages.splice(0)) this.postMessage(message);
    } else if (data.type === "lumine-output-resize") {
      const height = Number(data.height);
      if (!Number.isFinite(height)) return;
      const min = Math.max(24, Math.min(MAX_HEIGHT, Number(this.props.minHeight) || 24));
      const max = Math.max(min, Math.min(MAX_HEIGHT, Number(this.props.maxHeight) || MAX_HEIGHT));
      this.height = Math.max(min, Math.min(max, Math.ceil(height)));
      if (this.refs.frame) this.refs.frame.style.height = `${this.height}px`;
    } else if (data.type === "lumine-output-error") {
      const message = String(data.message || "The isolated output failed.").slice(0, 4000);
      this.windowChange?.reject(new Error(message));
      this.props.onError?.(message);
    } else {
      this.props.onMessage?.(data, this);
    }
  }

  bindDocument(document, { resetConnection = false } = {}) {
    if (this.document === document && !resetConnection) return;
    this.document?.defaultView.removeEventListener("message", this._onWindowMessage);
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
      this.port = null;
    }
    this.ready = false;
    this.document = document;
    document.defaultView.addEventListener("message", this._onWindowMessage);
  }

  didAttachToWindow({ document }) {
    this.bindDocument(document);
  }

  prepareWindowChange({ sourceUnavailable = false } = {}) {
    if (sourceUnavailable) {
      const frame = this.refs.frame;
      if (frame?.parentNode) {
        // Its native host has already disappeared. Retire the old browsing
        // context before the surrounding output is adopted into another realm.
        this.frameSlot = frame.ownerDocument.createComment("isolated output frame");
        frame.replaceWith(this.frameSlot);
      }
      return { checkpoint: this.lastCheckpoint ?? this.pendingCheckpoint ?? null };
    }
    if (!this.refs.frame?.isConnected) return { checkpoint: null };
    if (!this.ready || !this.port)
      throw new Error(
        "Wait for the interactive output to finish loading before moving its window.",
      );
    const requestId = randomBytes(12).toString("hex");
    const previousInert = this.element.inert;
    this.element.inert = true;
    const dispose = () => {
      this.element.inert = previousInert;
    };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error("The interactive output did not checkpoint its window state."));
      }, 5000);
      this.requests.set(requestId, {
        resolve: (checkpoint) => {
          this.lastCheckpoint = checkpoint;
          this.pendingCheckpoint = checkpoint;
          resolve({ checkpoint, dispose });
        },
        reject,
        timeout,
      });
      this.postMessage({ type: "lumine-output-checkpoint", requestId });
    }).catch((error) => {
      dispose();
      throw error;
    });
  }

  cancelWindowChange({ state }) {
    state.dispose?.();
  }

  async didChangeWindow({ state }) {
    const frame = this.refs.frame;
    const parent = frame?.parentNode ?? this.frameSlot?.parentNode;
    if (this.destroyed || !parent)
      throw new Error("The output was closed during a window transfer.");
    this.pendingCheckpoint = state.checkpoint;
    // Adoption can bootstrap a connection before this callback. Retire that
    // port and its queued handshake before navigating the frame again.
    this.nonce = randomBytes(24).toString("hex");
    this.bindDocument(this.element.ownerDocument, { resetConnection: true });
    // Retire the adopted browsing context before starting another navigation.
    // Changing src in place can race Chromium's own adoption navigation and
    // lose the child's one-time bootstrap. Reinsert the same element only
    // after its authenticated URL is set, creating one fresh context.
    this.ready = false;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error("The interactive output could not reconnect in its new window.");
        error.phase = this.port ? "initialization" : "frame-bootstrap";
        reject(error);
      }, 15000);
      this.windowChange = { resolve, reject, dispose: () => clearTimeout(timeout) };
      const next = frame.parentNode ? frame.nextSibling : this.frameSlot;
      frame.remove();
      frame.src = frameURL(this.nonce);
      parent.insertBefore(frame, next);
      this.frameSlot?.remove();
      this.frameSlot = null;
    }).finally(() => {
      this.windowChange.dispose();
      this.windowChange = null;
    });
  }

  postMessage(data) {
    if (this.destroyed) return false;
    if (!this.ready && !data?.type?.startsWith("lumine-output-")) {
      try {
        this.pendingMessages.push(structuredClone(data));
        return true;
      } catch (error) {
        this.props.onError?.(error.message);
        return false;
      }
    }
    if (!this.port) return false;
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
    this.windowChange?.reject(new Error("The output was closed during a window transfer."));
    this.keyboardHost.dispose();
    this.windowParticipant.dispose();
    for (const request of this.requests.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error("The output was closed."));
    }
    this.requests.clear();
    this.pendingMessages.length = 0;
    this.postMessage({ type: "lumine-output-dispose" });
    this.destroyed = true;
    clearTimeout(this._readyTimeout);
    this.document.defaultView.removeEventListener("message", this._onWindowMessage);
    const frame = this.refs.frame;
    // Removing an iframe immediately can stop it before AFM cleanup runs.
    // Atomic move preserves its browsing context while its old host is torn
    // down. The acknowledgement (or bounded timeout) removes the retired frame.
    const retain =
      this.port && frame?.isConnected && typeof this.document.body.moveBefore === "function";
    if (retain) {
      frame.style.display = "none";
      this.document.body.moveBefore(frame, null);
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
