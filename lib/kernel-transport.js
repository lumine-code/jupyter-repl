const { Disposable, Emitter } = require("lumine");
const { log } = require("./utils");

class KernelTransport {
  executionState = "loading";
  executionCount = 0;
  lastExecutionTime = "No execution";
  executionStartTime = null;

  constructor(kernelSpec, grammar) {
    this.kernelSpec = kernelSpec;
    this.grammar = grammar;
    this.language = kernelSpec.language.toLowerCase();
    this.displayName = kernelSpec.display_name;
    this._emitter = new Emitter();
  }

  setExecutionState(state) {
    // Guard against calls after destroy
    if (!this._emitter) {
      return;
    }
    const oldState = this.executionState;
    this.executionState = state;
    if (oldState !== state) {
      // Track execution start time for status bar timer
      if (state === "busy" && oldState !== "busy") {
        this.executionStartTime = Date.now();
      } else if (state !== "busy" && oldState === "busy") {
        this.executionStartTime = null;
      }
      this._emitter.emit("did-change-execution-state", state);
      this._emitStatus();
      // Emit "jupyter-repl-done" on the editor when execution completes
      if (state === "idle" && oldState === "busy") {
        // Required here rather than at module scope: the store reaches this
        // module through the kernel, so a static import would close a
        // load-time cycle.
        const editor = require("./store").editor;
        if (editor && editor.emitter) {
          editor.emitter.emit("jupyter-repl-done");
        }
      }
    }
  }

  setExecutionStartTime(time) {
    this.executionStartTime = time;
    this._emitStatus();
  }

  /**
   * Subscribe to execution state changes.
   * This is the preferred way to monitor kernel status from external packages.
   * @param {Function} callback - Called with the new state ('idle', 'busy', 'loading', etc.)
   * @returns {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    return this._emitter.on("did-change-execution-state", callback);
  }

  /**
   * Subscribe to any change of the execution status the UI shows: state,
   * count, last execution time, or start time. Coarser than
   * `onDidChangeExecutionState`; read the current values from the transport.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidChangeStatus(callback) {
    // After destroy there is nothing left to observe; hand back a no-op
    // disposable so late subscribers need no null checks.
    return this._emitter ? this._emitter.on("did-change-status", callback) : new Disposable();
  }

  _emitStatus() {
    if (this._emitter) {
      this._emitter.emit("did-change-status");
    }
  }

  /**
   * Subscribe to the kernel becoming unreachable — its process exited or the
   * connection is gone for good. The kernel facade settles every outstanding
   * execution on this signal, since no reply will ever arrive for them.
   * @param {Function} callback - Called with a human-readable reason string.
   * @returns {Disposable}
   */
  onDidLoseKernel(callback) {
    return this._emitter ? this._emitter.on("did-lose-kernel", callback) : new Disposable();
  }

  emitDidLoseKernel(reason) {
    this._emitter?.emit("did-lose-kernel", reason);
  }

  setExecutionCount(count) {
    this.executionCount = count;
    this._emitStatus();
  }

  setLastExecutionTime(timeString) {
    this.lastExecutionTime = timeString;
    this._emitStatus();
  }

  interrupt() {
    throw new Error("KernelTransport: interrupt method not implemented");
  }

  shutdown() {
    throw new Error("KernelTransport: shutdown method not implemented");
  }

  restart() {
    throw new Error("KernelTransport: restart method not implemented");
  }

  execute() {
    throw new Error("KernelTransport: execute method not implemented");
  }

  executeSilent() {
    throw new Error("KernelTransport: executeSilent method not implemented");
  }

  executeWatch() {
    throw new Error("KernelTransport: executeWatch method not implemented");
  }

  complete() {
    throw new Error("KernelTransport: complete method not implemented");
  }

  inspect() {
    throw new Error("KernelTransport: inspect method not implemented");
  }

  inputReply() {
    throw new Error("KernelTransport: inputReply method not implemented");
  }

  destroy() {
    log("KernelTransport: Destroying base kernel");
    if (this._emitter) {
      this._emitter.emit("did-change-execution-state", "dead");
      this._emitter.emit("did-change-status");
      this._emitter.dispose();
      this._emitter = null;
    }
  }
}

module.exports = KernelTransport;
