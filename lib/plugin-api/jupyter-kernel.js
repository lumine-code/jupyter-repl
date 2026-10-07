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

function sessionValue(session, name) {
  const state = sessions.get(session);
  return state.kernel ? state.kernel[name] : state.metadata[name];
}

/** A stable public session. Transport and resource ownership stay private. */
class JupyterKernel {
  static INTROSPECT_TIMEOUT_MS = 10000;

  constructor(kernel) {
    const state = {
      kernel,
      metadata: {},
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
      // Transport teardown synthesizes precise sent/queued outcomes after
      // announcing its reset. Let those settlements win before the fallback.
      queueMicrotask(() => {
        for (const request of pending)
          retireRequest(request, reason || "The session generation changed.");
      });
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
          for (const field of [
            "executionCount",
            "lastExecutionTime",
            "grammar",
            "language",
            "languageInfo",
            "displayName",
            "kernelSpec",
          ])
            state.metadata[field] = kernel[field];
          state.metadata.gatewayName = this.gatewayName;
          state.metadata.name = this.name;
          state.metadata.capabilities = this.capabilities;
          state.metadata.executionState = "dead";
          state.metadata.executionStartTime = null;
          state.kernel = null;
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
          request.generation !== state.generation ||
          kernel._destroyed ||
          kernel.destroyed ||
          (kernel.transport?.lifecycle && kernel.transport.lifecycle !== "ready")
        ) {
          retireRequest(request, "The session is not ready to accept requests.", "unavailable");
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
    return state.destroyed || Boolean(state.kernel?._destroyed || state.kernel?.destroyed);
  }
  isDestroyed() {
    return this.destroyed;
  }
  get connectionState() {
    const state = sessions.get(this);
    return this.destroyed ? "dead" : state.kernel.transport?.lifecycle || "ready";
  }
  get executionState() {
    return sessionValue(this, "executionState");
  }
  get executionCount() {
    return sessionValue(this, "executionCount");
  }
  get lastExecutionTime() {
    return sessionValue(this, "lastExecutionTime");
  }
  get executionStartTime() {
    return sessionValue(this, "executionStartTime");
  }
  get grammar() {
    return sessionValue(this, "grammar");
  }
  get language() {
    return sessionValue(this, "language");
  }
  get languageInfo() {
    return sessionValue(this, "languageInfo");
  }
  get displayName() {
    return sessionValue(this, "displayName");
  }
  get kernelSpec() {
    return sessionValue(this, "kernelSpec");
  }
  get gatewayName() {
    const state = sessions.get(this);
    return state.kernel ? state.kernel.transport?.gatewayName || null : state.metadata.gatewayName;
  }
  get name() {
    const state = sessions.get(this);
    return state.kernel
      ? state.kernel.transport?.session?.path || state.kernel.displayName
      : state.metadata.name;
  }
  get capabilities() {
    const state = sessions.get(this);
    if (!state.kernel) return state.metadata.capabilities;
    const transport = state.kernel.transport;
    return Object.freeze({
      rename: typeof transport?.rename === "function",
      disconnect: transport?.ownsKernelProcess === false,
      localSource: !transport?.session,
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
    return this.destroyed ? null : sessions.get(this).kernel.transport?.connectionFile || null;
  }
  rename(name) {
    if (this.destroyed || !this.capabilities.rename) return Promise.resolve(false);
    return Promise.resolve(sessions.get(this).kernel.transport.rename(name)).then(() => true);
  }
}

module.exports = JupyterKernel;
module.exports.getInternalKernel = getInternalKernel;
module.exports.isSession = isSession;
