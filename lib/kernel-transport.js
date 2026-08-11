const { Disposable, Emitter } = require("lumine");
const { log, formatElapsedTime } = require("./utils");

class KernelTransport {
  // What the kernel process is doing, across every client attached to it —
  // last writer wins, exactly as the kernel reports it. Our own connection's
  // lifecycle is the separate `lifecycle` field below.
  executionState = "loading";
  executionCount = 0;
  lastExecutionTime = "No execution";
  executionStartTime = null;
  // When the kernel last fell idle. The acknowledgment watchdog reads this: a
  // request the kernel has ignored throughout a long-enough idle stretch was
  // lost, not queued.
  idleSince = null;
  // Our connection's own lifecycle: loading | ready | restarting | dead.
  // Deliberately separate from `executionState` — a restart guard keyed on a
  // field every client's traffic overwrites would be no guard at all.
  lifecycle = "loading";

  constructor(kernelSpec, grammar) {
    this.kernelSpec = kernelSpec;
    this.grammar = grammar;
    this.language = kernelSpec.language.toLowerCase();
    this.displayName = kernelSpec.display_name;
    this._emitter = new Emitter();
  }

  setLifecycle(lifecycle) {
    this.lifecycle = lifecycle;
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
        // Freeze the finished span before the start time is cleared, so the
        // tile's last-execution segment covers every client's cells — our own
        // and a console's alike.
        if (this.executionStartTime) {
          this.lastExecutionTime = formatElapsedTime(Date.now() - this.executionStartTime);
        }
        this.executionStartTime = null;
      }
      if (state === "idle") {
        this.idleSince = Date.now();
      }
      this._emitter.emit("did-change-execution-state", state);
      this._emitStatus();
      if (state === "idle" && oldState === "busy") {
        // The kernel finished a cell — whoever asked for it. Watches and the
        // variable explorer refetch on this, so it fires for every client's
        // work; the kernel facade debounces and gates it.
        this._emitter.emit("did-become-idle");
        // Emit "jupyter-repl-done" on the editor when execution completes.
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

  /**
   * Subscribe to the kernel finishing a cell — any client's. Fires on every
   * busy-to-idle transition the kernel reports.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidBecomeIdle(callback) {
    return this._emitter ? this._emitter.on("did-become-idle", callback) : new Disposable();
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

  // Whether this transport speaks the comm protocol. A transport that cannot
  // carry comms renders a widget as its plain-text repr rather than failing.
  supportsComms = false;

  /**
   * Claim a comm target name. The kernel opens comms against a target, and the
   * handler turns each one into whatever this side keeps for it. Claim the
   * target before the kernel could use it: one it finds unclaimed it never
   * offers again.
   * @param {String} targetName
   * @param {Function} handler - (comm, openMessage) => void|Promise
   * @returns {Disposable}
   */
  registerCommTarget() {
    throw new Error("KernelTransport: registerCommTarget method not implemented");
  }

  /**
   * Create a comm this side initiates. Nothing goes on the wire until
   * `comm.open(...)` is called.
   * @param {String} targetName
   * @param {String} [commId] - Defaults to a fresh uuid.
   * @returns {Object}
   */
  createComm() {
    throw new Error("KernelTransport: createComm method not implemented");
  }

  /**
   * The comm this connection knows by that id, or undefined.
   * @param {String} commId
   * @returns {Object|undefined}
   */
  getComm() {
    throw new Error("KernelTransport: getComm method not implemented");
  }

  /**
   * Ask the kernel which comms it currently has open. The only way to find
   * objects that existed before we attached — a kernel adopted through
   * connect-to-existing-kernel, or one that outlived a window reload.
   * @param {String} [targetName] - Restrict to one target.
   * @returns {Promise<Object>} comm_id -> { target_name }
   */
  requestCommInfo() {
    throw new Error("KernelTransport: requestCommInfo method not implemented");
  }

  /**
   * Divert a request's output somewhere other than the cell that asked for it.
   *
   * This is what an Output widget is: while Python is inside `with out:`, the
   * widget publishes the id of the running request, and everything that request
   * prints belongs to the widget rather than to the bubble. Only outputs are
   * diverted — status, the execution count and the reply still reach the cell,
   * which is what lets it finish normally.
   *
   * @param {String} msgId - The request whose output moves.
   * @param {Function} handler - Called with each diverted message.
   * @returns {Disposable} Restores the output to its cell.
   */
  registerOutputRoute() {
    throw new Error("KernelTransport: registerOutputRoute method not implemented");
  }

  /**
   * Subscribe to every comm on this connection becoming worthless at once — a
   * restart, a dead process, a dropped websocket. Consumers that mirror kernel
   * state drop everything they hold here.
   * @param {Function} callback - Called with a human-readable reason.
   * @returns {Disposable}
   */
  onDidResetComms(callback) {
    return this._emitter ? this._emitter.on("did-reset-comms", callback) : new Disposable();
  }

  emitDidResetComms(reason) {
    this._emitter?.emit("did-reset-comms", reason);
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
