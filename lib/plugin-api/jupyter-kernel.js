const { CompositeDisposable, Disposable, Emitter } = require("lumine");
const RequestHandle = require("../request-handle");
const { retireRequest } = RequestHandle;

const sessions = new WeakMap();

function getInternalKernel(session) {
  return sessions.get(session)?.kernel || null;
}

function isSession(value) {
  return sessions.has(value);
}

/** A stable public session. Transport and resource ownership stay private. */
class JupyterKernel {
  static INTROSPECT_TIMEOUT_MS = 10000;

  constructor(kernel) {
    const state = {
      kernel,
      id: kernel.id,
      generation: 0,
      destroyed: false,
      requests: new Set(),
      emitter: new Emitter(),
      subscriptions: new CompositeDisposable(),
    };
    sessions.set(this, state);
    const reset = (reason) => {
      state.generation++;
      const pending = [...state.requests];
      state.requests.clear();
      for (const request of pending)
        retireRequest(request, reason || "The session generation changed.");
      state.emitter.emit("did-change-generation", state.generation);
    };
    if (kernel.transport?.onDidResetComms)
      state.subscriptions.add(kernel.transport.onDidResetComms(reset));
    if (kernel.transport?.onDidChangeLifecycle)
      state.subscriptions.add(
        kernel.transport.onDidChangeLifecycle((value) => {
          state.emitter.emit("did-change-connection-state", value);
        }),
      );
    if (kernel.emitter?.on)
      state.subscriptions.add(
        kernel.emitter.on("did-destroy", () => {
          if (state.destroyed) return;
          state.destroyed = true;
          reset("The session was destroyed.");
          state.subscriptions.dispose();
          state.emitter.emit("did-destroy");
          state.emitter.dispose();
        }),
      );
  }

  request(descriptor) {
    if (!descriptor || !["execute", "inspect", "complete"].includes(descriptor.type))
      throw new TypeError("A request type of execute, inspect or complete is required.");
    if (!["user", "query"].includes(descriptor.purpose))
      throw new TypeError("A request purpose of user or query is required.");
    if (typeof descriptor.code !== "string") throw new TypeError("Request code must be a string.");
    const state = sessions.get(this);
    const { kernel } = state;
    const { type, purpose, code, cursorPos = code.length, signal } = descriptor;
    const timeoutMs =
      descriptor.timeoutMs ??
      (type === "execute" && purpose === "user" ? 0 : JupyterKernel.INTROSPECT_TIMEOUT_MS);
    const request = new RequestHandle({
      type,
      generation: state.generation,
      timeoutMs,
      signal,
      onFinish: (handle) => state.requests.delete(handle),
      start: (output, data) => {
        if (
          state.destroyed ||
          kernel._destroyed ||
          kernel.destroyed ||
          (kernel.transport?.lifecycle && kernel.transport.lifecycle !== "ready")
        ) {
          retireRequest(request, "The session is not ready to accept requests.");
          return null;
        }
        if (type === "execute")
          return purpose === "query"
            ? kernel.executeWatch(code, output)
            : kernel.execute(code, output);
        if (type === "inspect") return kernel.inspect(code, cursorPos, data);
        return kernel.complete(code, data);
      },
    });
    state.requests.add(request);
    request.done.then(() => state.requests.delete(request));
    return request;
  }

  get id() {
    return sessions.get(this).id;
  }
  get generation() {
    return sessions.get(this).generation;
  }
  get destroyed() {
    const state = sessions.get(this);
    return state.destroyed || Boolean(state.kernel._destroyed || state.kernel.destroyed);
  }
  isDestroyed() {
    return this.destroyed;
  }
  get connectionState() {
    const state = sessions.get(this);
    return this.destroyed ? "dead" : state.kernel.transport?.lifecycle || "ready";
  }
  get executionState() {
    return sessions.get(this).kernel.executionState;
  }
  get executionCount() {
    return sessions.get(this).kernel.executionCount;
  }
  get lastExecutionTime() {
    return sessions.get(this).kernel.lastExecutionTime;
  }
  get executionStartTime() {
    return sessions.get(this).kernel.executionStartTime;
  }
  get grammar() {
    return sessions.get(this).kernel.grammar;
  }
  get language() {
    return sessions.get(this).kernel.language;
  }
  get languageInfo() {
    return sessions.get(this).kernel.languageInfo;
  }
  get displayName() {
    return sessions.get(this).kernel.displayName;
  }
  get kernelSpec() {
    return sessions.get(this).kernel.kernelSpec;
  }
  get gatewayName() {
    return sessions.get(this).kernel.transport?.gatewayName || null;
  }
  get capabilities() {
    const transport = sessions.get(this).kernel.transport;
    return Object.freeze({
      rename: typeof transport?.rename === "function",
      disconnect: transport?.ownsKernelProcess === false,
    });
  }

  onDidChangeGeneration(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).emitter.on("did-change-generation", callback);
  }
  onDidChangeConnectionState(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).emitter.on("did-change-connection-state", callback);
  }
  onDidDestroy(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).emitter.on("did-destroy", callback);
  }
  onDidChangeExecutionState(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).kernel.onDidChangeExecutionState(callback);
  }
  onDidChangeStatus(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).kernel.onDidChangeStatus(callback);
  }
  onDidBecomeIdle(callback) {
    return this.destroyed ? new Disposable() : sessions.get(this).kernel.onDidBecomeIdle(callback);
  }
  onDidRequestInput(callback) {
    return this.destroyed
      ? new Disposable()
      : sessions.get(this).kernel.emitter.on("did-request-input", callback);
  }
  interrupt() {
    if (!this.destroyed) return sessions.get(this).kernel.interrupt();
  }
  restart() {
    return this.destroyed ? Promise.resolve(false) : sessions.get(this).kernel.restart();
  }
  shutdown() {
    return this.destroyed ? Promise.resolve() : sessions.get(this).kernel.shutdownAndDestroy();
  }
  disconnect() {
    if (!this.destroyed && this.capabilities.disconnect) return sessions.get(this).kernel.destroy();
  }
  getConnectionFile() {
    return sessions.get(this).kernel.transport?.connectionFile || null;
  }
  rename(name) {
    if (this.destroyed || !this.capabilities.rename) return Promise.resolve(false);
    return Promise.resolve(sessions.get(this).kernel.transport.rename(name)).then(() => true);
  }
}

module.exports = JupyterKernel;
module.exports.getInternalKernel = getInternalKernel;
module.exports.isSession = isSession;
