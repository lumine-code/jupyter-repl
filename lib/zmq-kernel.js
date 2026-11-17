const { Disposable } = require("lumine");
const { randomUUID } = require("node:crypto");

const Config = require("./config");
const KernelTransport = require("./kernel-transport");
const ShellRequestCoordinator = require("./zmq-shell-requests");
const ZMQConnectionGeneration = require("./zmq-connection-generation");
const ZMQRecovery = require("./zmq-recovery");
const { log, js_idx_to_char_idx } = require("./utils");
const { Message } = require("./jmp");
const { msgSpecToNotebookFormat, OUTPUT_TYPES } = require("./output-utils");
const { COMM_MESSAGE_TYPES, CommRegistry, toWireBuffers } = require("./comm");

const NOOP = () => {};

// Shell requests whose busy/idle pair describes housekeeping rather than a
// cell, keyed by what the kernel echoes back as `parent_header.msg_type`.
// Their status must never reach the status bar, the per-cell timer, or the
// idle that watches and the variable explorer refetch on.
//
// This is a floor under `suppressStatus`, not a replacement for it: the
// callback entry is the authority while it exists, but a status can land with
// no entry to consult — a foreign client's introspection never has one here,
// and our own can lose its entry early to the watchdog's reclaim or a
// teardown's sweep. Deliberately excludes `execute_request`, because a cell
// is a cell whoever ran it, and `shutdown_request`.
const NON_CELL_PARENTS = new Set([
  "complete_request",
  "inspect_request",
  "kernel_info_request",
  "comm_info_request",
  "history_request",
  "is_complete_request",
  ...COMM_MESSAGE_TYPES,
]);

class ZMQKernel extends KernelTransport {
  supportsComms = true;

  // Ordinary shell traffic is single-flight: the next request waits for both
  // reply and idle. Its ledger belongs to the coordinator, while these accessors
  // preserve the transport's existing inspection surface.
  _shellRequests() {
    return (this._requestCoordinator ??= new ShellRequestCoordinator(this));
  }

  get executionCallbacks() {
    return this._shellRequests().callbacks;
  }

  set executionCallbacks(callbacks) {
    this._shellRequests().callbacks = callbacks;
  }

  get _shellQueue() {
    return this._shellRequests().queue;
  }

  set _shellQueue(queue) {
    this._shellRequests().queue = queue;
  }

  get _activeShellRequest() {
    return this._shellRequests().activeRequest;
  }

  set _activeShellRequest(requestId) {
    this._shellRequests().activeRequest = requestId;
  }

  _connectionOwner() {
    return (this._generationOwner ??= new ZMQConnectionGeneration(this));
  }

  _recoveryOwner() {
    return (this._recoveryController ??= new ZMQRecovery(this));
  }

  _dismissUnresponsiveNotification() {
    return this._recoveryOwner().dismissNotification();
  }

  // Readiness probes live in the request ledger; the owner releases the
  // physical sockets and process once these protocol waits have been stopped.
  _readyProbeIds = new Set();
  _lastOutputStore = null;
  // The kernel's execution state exactly as published on iopub, before the
  // suppression filter — our own watch refetches and comm messages included.
  // `executionState` deliberately ignores suppressed traffic so a watch cannot
  // flash the status bar, but the kernel is exactly as busy running a watch or
  // a widget callback as running a cell, and the acknowledgment watchdog must
  // judge idleness against what the kernel is actually doing, or it settles
  // requests that are merely queued behind that invisible work.
  _reportedExecutionState = null;
  _reportedIdleSince = null;
  // Which request the last status was parented to. When a repair finds the
  // report stuck at busy, this is what says whether the stuck word is the
  // repaired request's own — and safe to overwrite — or another cell's, which
  // must stand.
  _reportedStatusParent = null;

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar);
    this.startingKernelKey = options?.startingKernelKey || kernelSpec.display_name;
    this._connectionOwner().start(options, onStarted);
  }

  _launchInitialGeneration() {
    return this._connectionOwner().launchInitial();
  }

  _clearStartingMarker() {
    const store = require("./store");
    const key = this.startingKernelKey || this.kernelSpec.display_name;
    const owner = store.startingKernels.get(key);
    if (owner === this || owner === true) store.startingKernels.delete(key);
  }

  _ensureRequestState() {
    this._shellRequests();
    this._quarantinedRequestIds ||= new Set();
    this._connectionGeneration ??= 0;
  }

  connect(done) {
    return this._connectionOwner().connect(done);
  }

  _handleSocketError(name, error, generation) {
    if (
      generation !== this._connectionGeneration ||
      this._destroyed ||
      this.lifecycle === "dead" ||
      this.lifecycle === "unresponsive"
    ) {
      return;
    }
    const reason = `${name} socket failed: ${error?.message || error}`;
    log("ZMQKernel:", reason);
    if (this.lifecycle === "restarting" || this.lifecycle === "loading") {
      this._connectionOwner().rejectInitialization(new Error(reason, { cause: error }));
      return;
    }
    if (this._activeShellRequest) this._quarantine(this._activeShellRequest, reason);
    else this._quarantineBarrier(reason);
  }

  monitorNotifications(childProcess) {
    return this._connectionOwner().monitorProcess(childProcess);
  }

  monitor(done) {
    this._cancelReadiness?.();
    const generation = this._connectionGeneration;
    const { shellSocket, ioSocket, stdinSocket } = this;
    // At most one minute of probes. Keep their response halves separate so
    // a lost idle for one request cannot be supplied by another.
    const probes = new Map();
    let channelsAnswered = false;
    let deadline;
    const isCurrent = () =>
      this._cancelReadiness === cancel &&
      !this._destroyed &&
      generation === this._connectionGeneration &&
      this.shellSocket === shellSocket &&
      this.ioSocket === ioSocket &&
      this.stdinSocket === stdinSocket;
    const cancel = () => {
      if (this._cancelReadiness !== cancel) return;
      this._cancelReadiness = null;
      clearTimeout(deadline);
      this._stopReadyProbe();
      this._discardReadyProbes();
      shellSocket.removeListener("message", onShell);
      ioSocket.removeListener("message", onIO);
    };
    const tryComplete = () => {
      // The stdin DEALER uses ZMQ_IMMEDIATE. Writable means it has a
      // completed connection to the ROUTER, without relying on monitor
      // delivery or sending an unsolicited Jupyter message on stdin.
      if (!isCurrent() || !channelsAnswered || !stdinSocket.writable) return false;
      cancel();
      done();
      return true;
    };
    const fail = (message) => {
      cancel();
      this._connectionOwner().rejectInitialization(new Error(message));
    };
    const mark = (message, part) => {
      if (
        !isCurrent() ||
        !_isValidMessage(message) ||
        message.parent_header.msg_type !== "kernel_info_request" ||
        !this._isOwnMessage(message)
      ) {
        return;
      }
      const probe = probes.get(message.parent_header.msg_id);
      if (!probe) return;
      const { status, ename, evalue } = message.content || {};
      if (part === "reply" && status !== undefined && status !== "ok") {
        fail([ename, evalue].filter(Boolean).join(": ") || "The kernel rejected kernel_info.");
        return;
      }
      probe[part] = true;
      channelsAnswered ||= probe.reply && probe.idle;
      tryComplete();
    };
    const onShell = (message) => {
      if (message?.header?.msg_type === "kernel_info_reply" && message.parent_header) {
        mark(message, "reply");
      }
    };
    const onIO = (message) => {
      if (
        message?.header?.msg_type === "status" &&
        message.content?.execution_state === "idle" &&
        message.parent_header
      ) {
        mark(message, "idle");
      }
    };
    const probe = () => {
      if (!isCurrent()) return;
      if (tryComplete()) return;
      if (channelsAnswered) return;
      this._discardReadyProbes();
      const requestId = `ready_probe_${randomUUID()}`;
      probes.set(requestId, { reply: false, idle: false });
      this._readyProbeIds.add(requestId);
      this._sendDirectShellMessage(
        this._createMessage("kernel_info_request", requestId),
        requestId,
        NOOP,
        true,
      );
    };
    this._cancelReadiness = cancel;
    shellSocket.on("message", onShell);
    ioSocket.on("message", onIO);
    deadline = setTimeout(() => {
      if (!isCurrent() || tryComplete()) return;
      fail(
        channelsAnswered
          ? "The kernel input channel did not connect."
          : "The kernel did not answer on shell and IOPub.",
      );
    }, 60000);
    this._readyProbe = setInterval(probe, 500);
    probe();
  }

  _discardReadyProbes() {
    for (const requestId of this._readyProbeIds) {
      delete this.executionCallbacks[requestId];
    }
    this._readyProbeIds.clear();
  }

  _publishReady(restarting) {
    const owner = this._connectionOwner();
    const expected = restarting ? "restarting" : "loading";
    const canPublish = () =>
      !this._destroyed && !owner.shutdownPromise && this.lifecycle === expected;
    if (!canPublish()) return false;
    if (restarting) {
      this.setExecutionCount(0);
      this.setLastExecutionTime("No execution");
    }
    this._reportedExecutionState = "idle";
    this._reportedIdleSince = Date.now();
    this._reportedStatusParent = null;
    this.setExecutionState("idle");
    if (!canPublish()) return false;
    this._everReady = true;
    this._startAckWatchdog();
    this.setLifecycle("ready");
    return true;
  }

  _stopReadyProbe() {
    if (this._readyProbe) {
      clearInterval(this._readyProbe);
      this._readyProbe = null;
    }
  }

  interrupt() {
    if (process.platform === "win32") {
      lumine.notifications.addWarning("Cannot interrupt this kernel", {
        detail: "Kernel interruption is currently not supported in Windows.",
      });
    } else {
      log("ZMQKernel: sending SIGINT");
      this.kernelProcess.kill("SIGINT");
    }
  }

  static STARTUP_TIMEOUT_MS = 60000;

  async _executeStartupCode(signal) {
    const languageCode = Config.getJson("startupCodePerLanguage")[this.language];
    const kernelCode =
      Config.getJson("startupCodePerKernel")[this.displayName] ||
      Config.getJson("startupCode")[this.displayName];
    const commands = [languageCode, kernelCode].filter(Boolean);
    if (this.language === "python") {
      const mode = lumine.config.get("jupyter-repl.pythonAutoreload");
      if (mode !== "off") {
        commands.push("%load_ext autoreload");
        const printActivity = lumine.config.get("jupyter-repl.pythonAutoreloadPrint");
        commands.push(printActivity ? `%autoreload ${mode} --print` : `%autoreload ${mode}`);
      }
    }
    for (const code of commands) {
      signal.throwIfAborted();
      await this._executeStartupRequest(code, signal);
    }
  }

  _executeStartupRequest(code, signal) {
    signal.throwIfAborted();
    const requestId = `startup_${randomUUID()}`;
    const message = this._createExecuteMessage(requestId, code + "\n", {
      allow_stdin: false,
      store_history: false,
    });
    const { promise, resolve, reject } = Promise.withResolvers();
    const abort = () => {
      delete this.executionCallbacks[requestId];
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      let reply;
      let idle = false;
      this._sendDirectShellMessage(
        message,
        requestId,
        (response, channel) => {
          if (channel === "shell" && response.header.msg_type === "execute_reply") {
            reply = response.content;
          } else if (
            channel === "iopub" &&
            response.header.msg_type === "status" &&
            response.content.execution_state === "idle"
          ) {
            idle = true;
          }
          if (!reply || !idle) return;
          if (reply.status === "ok") resolve();
          else {
            const detail = [reply.ename, reply.evalue].filter(Boolean).join(": ");
            reject(new Error(detail || "The kernel could not execute its startup code."));
          }
        },
        true,
      );
    } catch (error) {
      reject(error);
    }
    return promise.finally(() => signal.removeEventListener("abort", abort));
  }

  /**
   * Ask the kernel to shut itself down, and wait for it to actually go.
   *
   * Awaited by every caller, because every one of them destroys the kernel on
   * the next line and `destroy` ends in SIGKILL. Unawaited — as this was — the
   * signal beat the request out the door and nothing in the kernel's own
   * teardown ever ran: no `atexit`, no flushed buffers, no released handle on
   * whatever the session had open.
   *
   * Best-effort by design. A kernel that will not go quietly inside
   * SHUTDOWN_TIMEOUT_MS is killed anyway by the `destroy` that follows.
   */
  shutdown() {
    return this._connectionOwner().shutdown();
  }

  restart(onRestarted) {
    return this._socketRestart(onRestarted);
  }

  get canRestart() {
    return (
      !this._destroyed &&
      !this._shutdownPromise &&
      !["loading", "shutting-down"].includes(this.lifecycle)
    );
  }

  /** How long a kernel gets to exit on its own before `destroy` kills it. */
  static SHUTDOWN_TIMEOUT_MS = 2000;

  _socketShutdown() {
    return this._connectionOwner().socketShutdown();
  }

  /**
   * Detach and close all three sockets, exactly once. The refs are nulled so
   * a later teardown — `destroy` after a graceful shutdown — finds nothing
   * left to close.
   */
  _releaseSockets(forUnload, discardPending = false) {
    return this._connectionOwner().releaseSockets(forUnload, discardPending);
  }

  /** Resolve when the kernel process exits, or when the wait runs out. */
  _awaitProcessExit(timeoutMs) {
    return this._connectionOwner().awaitProcessExit(timeoutMs);
  }

  // Clear all pending state (used in restart and destroy)
  _clearState(reason = "Kernel state cleared", forUnload = false, invalidate = false) {
    this._ensureRequestState();
    // Taken whole and replaced before anything is notified, so a callback that
    // arms a fresh request keeps it — the same shape `Kernel#abortInFlight`
    // uses, and the reason `_settlePending` exists apart from the lookup in
    // `_settleUnanswered`.
    const pending = this._shellRequests().takePending();
    const recoveryClosed = this._clearRecovery(forUnload);
    this._quarantinedRequestIds.clear();
    this._readyProbeIds.clear();
    this._lastOutputStore = null;
    // The requests those routes named are gone with the process.
    this._outputRoutes?.clear();
    // The comms belonged to a process that is gone. Dropped locally, with no
    // comm_close going out: there is nothing left to close, and on a shared
    // kernel closing is not ours to do. The target claims survive — the next
    // process must find them already taken, or it never offers a comm again.
    this._comms?.clear(reason);
    this.emitDidResetComms(reason);

    // The ledger knows whether each request was sent. Settle it after removing
    // output routes so failures reach the original request observers. Preserve
    // the lifecycle and execution state set by the operation that retired it.
    for (const [requestId, callbackInfo] of pending) {
      const cancelled = invalidate && callbackInfo.queued;
      const unknown = invalidate && !cancelled && callbackInfo.requestType === "execute_request";
      this._settlePending(
        requestId,
        callbackInfo,
        cancelled ? "ExecutionCancelled" : unknown ? "ExecutionOutcomeUnknown" : "KernelGone",
        cancelled
          ? "The request was cancelled before it was sent."
          : unknown
            ? `${reason}. The execution may have changed kernel state.`
            : reason,
        { updateStatus: false },
      );
    }
    return recoveryClosed;
  }

  invalidatePendingRequests(reason) {
    this.setLifecycle("shutting-down");
    this.setExecutionState("shutting-down");
    return this._clearState(reason, false, true);
  }

  _socketRestart(onRestarted) {
    return this._connectionOwner().restart(onRestarted);
  }

  _replaceConnectionGeneration() {
    return this._connectionOwner().replace();
  }

  _launchFreshGeneration() {
    return this._connectionOwner().launchFresh();
  }

  _killProcessTree(childProcess) {
    return this._connectionOwner().killProcessTree(childProcess);
  }

  /** Queue one ordinary shell request. Only the active record reaches ZMQ. */
  _sendShellMessage(message, requestId, onResults, suppressStatus = false, options = {}) {
    return this._shellRequests().send(message, requestId, onResults, suppressStatus, options);
  }

  _sendDirectShellMessage(message, requestId, onResults, suppressStatus = false, options = {}) {
    return this._shellRequests().sendDirect(message, requestId, onResults, suppressStatus, options);
  }

  _cancelQueuedRequests(predicate, ename, evalue) {
    return this._shellRequests().cancelQueued(predicate, ename, evalue);
  }

  _drainShellQueue() {
    return this._shellRequests().drain();
  }

  _scheduleShellDrain() {
    return this._shellRequests().scheduleDrain();
  }

  static ACK_PROBE_AFTER_MS = 2000;
  static RECOVERY_RETRY_MS = 5000;
  static RECOVERY_TIMEOUT_MS = 30000;
  static MAX_RECOVERY_PROBES = 2;

  /**
   * Allow ten quiet seconds for a missing reply or idle after the first half
   * arrived. This acknowledged-request grace is separate from the two-second
   * idle wait that starts recovery and its thirty-second idle recovery limit.
   */
  static HALF_SETTLED_GRACE_MS = 10000;

  static ACK_POLL_INTERVAL_MS = 500;

  _startAckWatchdog() {
    return this._recoveryOwner().startWatchdog();
  }

  _recordRequestProgress(requestId, callbackInfo) {
    return this._recoveryOwner().recordProgress(requestId, callbackInfo);
  }

  _beginRecovery(requestId) {
    return this._recoveryOwner().begin(requestId);
  }

  _runRecoveryProbe() {
    return this._recoveryOwner().runProbe();
  }

  _createRecoverySocket(scheme, key) {
    return this._recoveryOwner().createProbeSocket(scheme, key);
  }

  _handleRecoveryProbeIO(message) {
    return this._recoveryOwner().handleProbeIO(message);
  }

  _maybeFinishRecovery() {
    return this._recoveryOwner().maybeFinish();
  }

  _completeRecovery(recovery) {
    return this._recoveryOwner().complete(recovery);
  }

  _closeRecoveryProbes(forUnload = false) {
    return this._recoveryOwner().closeProbes(forUnload);
  }

  _clearRecovery(forUnload = false) {
    return this._recoveryOwner().clear(forUnload);
  }

  _quarantine(requestId, reason, options = {}) {
    return this._recoveryOwner().quarantine(requestId, reason, options);
  }

  _quarantineBarrier(reason) {
    return this._recoveryOwner().quarantineBarrier(reason);
  }

  _showUnresponsiveNotification(reason, outcomeUnknown = true) {
    return this._recoveryOwner().showNotification(reason, outcomeUnknown);
  }

  _stopAckWatchdog() {
    return this._recoveryOwner().stopWatchdog();
  }

  /**
   * Settle a request whose non-delivery is known — a send failed, the process
   * went away, or the request was still in our local queue. A sent request
   * with no acknowledgement never comes here merely because time passed; its
   * outcome is unknown and recovery/quarantine owns it.
   *
   * @param {Object} [options]
   * @param {Boolean} [options.skipIdle] - Omit the trailing idle, for a
   *   request whose idle already arrived and whose reply is what went
   *   missing. Delivering a second one would be a duplicate.
   * @param {Boolean} [options.updateStatus] - Whether settling may move the
   *   execution state. False for a caller that owns that state itself.
   */
  _settleUnanswered(requestId, requestType, ename, evalue, options = {}) {
    return this._shellRequests().settleUnanswered(requestId, requestType, ename, evalue, options);
  }

  _finishShellRequest(requestId, callbackInfo) {
    return this._shellRequests().finish(requestId, callbackInfo);
  }

  _settlePending(requestId, callbackInfo, ename, evalue, options = {}) {
    return this._shellRequests().settlePending(requestId, callbackInfo, ename, evalue, options);
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults, options = {}) {
    log("ZMQKernel.execute:", code);
    const requestId = `execute_${randomUUID()}`;

    const message = this._createExecuteMessage(requestId, code, options);
    this._sendShellMessage(message, requestId, onResults, options.suppressStatus ?? false);
    return this._shellRequests().observation(requestId);
  }

  _createExecuteMessage(requestId, code, options) {
    const message = this._createMessage("execute_request", requestId);
    message.content = {
      code,
      silent: options.silent ?? false,
      store_history: options.store_history ?? true,
      user_expressions: {},
      allow_stdin: options.allow_stdin ?? true,
    };

    return message;
  }

  /**
   * Execute code for watch pane - gets output but doesn't affect status bar or history.
   */
  executeWatch(code, onResults) {
    return this.execute(code, onResults, {
      silent: false,
      store_history: false,
      allow_stdin: false,
      suppressStatus: true,
    });
  }

  complete(code, onResults) {
    log("ZMQKernel.complete:", code);
    const requestId = `complete_${randomUUID()}`;

    const message = this._createMessage("complete_request", requestId);

    message.content = {
      code,
      text: code,
      line: code,
      cursor_pos: js_idx_to_char_idx(code.length, code),
    };
    // Suppress status to avoid "busy" flash during autocomplete
    this._sendShellMessage(message, requestId, onResults, true);
    return this._shellRequests().observation(requestId);
  }

  inspect(code, cursorPos, onResults) {
    log("ZMQKernel.inspect:", code, cursorPos);
    const requestId = `inspect_${randomUUID()}`;

    const message = this._createMessage("inspect_request", requestId);

    message.content = {
      code,
      cursor_pos: js_idx_to_char_idx(cursorPos, code),
      detail_level: 0,
    };
    // Suppress status to avoid "busy" flash during inspection
    this._sendShellMessage(message, requestId, onResults, true);
    return this._shellRequests().observation(requestId);
  }

  /**
   * Ask the kernel which comms it currently has open.
   *
   * The only way to find objects that existed before we attached: a kernel
   * adopted through connect-to-existing-kernel, or one that outlived a window
   * reload, is already full of widgets we have never heard of.
   *
   * @param {String} [targetName] - Restrict to one target.
   * @returns {Promise<Object>} comm_id -> { target_name }
   */
  requestCommInfo(targetName) {
    return new Promise((resolve, reject) => {
      const requestId = `comm_info_${randomUUID()}`;
      const message = this._createMessage("comm_info_request", requestId);
      message.content = targetName ? { target_name: targetName } : {};
      // A one-shot request: onShellMessage retires any non-execute reply as
      // soon as it arrives. Suppressed, because asking the kernel what exists
      // is not running a cell. If the request is lost the watchdog synthesizes
      // an error reply on this same channel, which becomes the rejection.
      this._sendShellMessage(
        message,
        requestId,
        (reply, channel) => {
          if (channel !== "shell") {
            return;
          }
          if (reply.content?.status === "error") {
            reject(new Error(reply.content.evalue || "comm_info_request failed"));
            return;
          }
          resolve(reply.content?.comms || {});
        },
        true,
      );
    });
  }

  /**
   * The comm registry for this connection, built on first use — a kernel
   * nobody puts a widget on never allocates one.
   */
  _commRegistry() {
    if (!this._comms) {
      this._comms = new CommRegistry({
        send: (msgType, content, metadata, buffers) =>
          this._sendCommMessage(msgType, content, metadata, buffers),
      });
    }
    return this._comms;
  }

  registerCommTarget(targetName, handler) {
    return this._commRegistry().registerTarget(targetName, handler);
  }

  registerOutputRoute(msgId, handler) {
    if (!this._outputRoutes) {
      this._outputRoutes = new Map();
    }
    const handlers = this._outputRoutes.get(msgId) ?? new Set();
    handlers.add(handler);
    this._outputRoutes.set(msgId, handlers);
    return new Disposable(() => {
      const current = this._outputRoutes?.get(msgId);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this._outputRoutes.delete(msgId);
      }
    });
  }

  createComm(targetName, commId) {
    return this._commRegistry().createComm(targetName, commId);
  }

  getComm(commId) {
    return this._comms?.getComm(commId);
  }

  /**
   * Send a comm message on the shell socket.
   *
   * Unlike every other shell request this gets no reply: the kernel answers a
   * comm message only with the busy/idle pair it publishes around any shell
   * message, so `expectsReply: false` is what lets that idle retire the entry
   * on its own. Suppressed, because a widget's traffic is not the user's cell —
   * left visible, every frame of a dragged slider would flash the status bar
   * busy and fire every watch on the idle.
   *
   * @returns {String} The request id, synchronously — IClassicComm's contract.
   */
  _sendCommMessage(msgType, content, metadata = {}, buffers = []) {
    const requestId = `${msgType}_${randomUUID()}`;
    const message = this._createMessage(msgType, requestId);
    message.content = content;
    message.metadata = metadata || {};
    message.buffers = toWireBuffers(buffers);
    this._sendShellMessage(message, requestId, NOOP, true, { expectsReply: false });
    return requestId;
  }

  async inputReply(input) {
    if (
      this.lifecycle === "unresponsive" ||
      (this.lifecycle === "recovering" && !this._recovery?.targetProgress)
    ) {
      lumine.notifications.addWarning("Kernel input was not sent", {
        detail: "Restart the kernel if the connection remains unavailable.",
        dismissable: true,
      });
      return;
    }
    const requestId = `input_reply_${randomUUID()}`;

    const message = this._createMessage("input_reply", requestId);

    message.content = {
      value: input,
    };
    try {
      await this.stdinSocket.send(new Message(message));
    } catch (error) {
      // The kernel is blocked in input() waiting for this reply; a silent drop
      // would leave it hung with nothing on screen to say why.
      log("ZMQKernel: Error sending input reply:", error);
      lumine.notifications.addError("Kernel input reply not delivered", {
        description:
          "The kernel is waiting for input, but the reply could not be sent. " +
          "Interrupt or restart the kernel to continue.",
        detail: `Kernel: ${this.kernelSpec.display_name}\n\n${error.message}`,
        dismissable: true,
      });
    }
  }

  onShellMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed || this.lifecycle === "unresponsive") return;

    log("shell message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    if (message.header.msg_type === "kernel_info_reply" && message.content?.language_info) {
      this.setLanguageInfo(message.content.language_info);
    }

    const { msg_id } = message.parent_header;
    if (this._quarantinedRequestIds?.has(msg_id)) return;
    const callbackInfo = msg_id ? this.executionCallbacks[msg_id] : undefined;
    if (!callbackInfo) {
      return;
    }
    this._recordRequestProgress(msg_id, callbackInfo);

    // Every reply retires the same way, whatever it answers. Retiring a
    // one-shot reply on the spot — as this used to — dropped the entry before
    // the trailing idle, and the entry is what says the request's status is
    // not a cell's; every completion then dragged the status bar behind it.
    //
    // The callback runs first, matching the iopub path, so `finally` is what
    // keeps a throwing callback — a plugin's, through the middleware chain —
    // from stranding the entry it was about to retire.
    try {
      callbackInfo.callback(message, "shell");
    } finally {
      callbackInfo.replySeen = true;
      this._retireExecution(msg_id, callbackInfo);
    }
  }

  onStdinMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed || this.lifecycle === "unresponsive") return;

    log("stdin message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    // input_request messages are attributable to particular execution requests,
    // and should pass through the middleware stack to allow plugins to see them
    const { msg_id } = message.parent_header;
    let callbackInfo;

    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    if (callbackInfo) {
      this._recordRequestProgress(msg_id, callbackInfo);
      callbackInfo.callback(message, "stdin");
    }
  }

  onIOMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed || this.lifecycle === "unresponsive") return;

    log("IO message:", message);

    // Comm traffic is kernel-scoped, and much of it is kernel-initiated: an
    // update pushed from a background thread carries an empty parent_header,
    // and one caused by another client carries that client's session. Both of
    // the checks below drop those — correctly, for output — so comms are
    // routed ahead of them rather than by relaxing a validity rule that also
    // guards execute traffic. A comm message is never output and never drives
    // status, so nothing further down applies to it.
    if (message?.content && COMM_MESSAGE_TYPES.has(message?.header?.msg_type)) {
      this._comms?.handleIOPubMessage(message);
      return;
    }

    if (!_isValidMessage(message)) {
      return;
    }

    this._handleRecoveryProbeIO(message);

    const { msg_type } = message.header;
    const { msg_id } = message.parent_header;
    if (this._quarantinedRequestIds?.has(msg_id)) return;

    // IOPub is a broadcast: one kernel can serve several clients, and every
    // one of them publishes here. Ownership decides where a message may act.
    // Output and callback dispatch are strictly ours — another client's work
    // is that client's to display, and its ids are independent of ours, so a
    // colliding msg_id must never reach one of our callbacks. Status, the
    // execution count, and the timer describe the kernel process itself, so
    // every client's traffic drives them.
    const own = this._isOwnMessage(message);
    // Only our own requests can suppress status — a callback found for a
    // foreign message would be an id collision, not a request of ours.
    const callbackInfo = own && msg_id ? this.executionCallbacks[msg_id] : undefined;
    // The entry decides while it exists; the request it answers decides once
    // it is gone. Falling back to `false` here is what let an autocomplete
    // keystroke drag the status bar to idle mid-cell — see NON_CELL_PARENTS.
    const suppressStatus =
      callbackInfo?.suppressStatus ?? NON_CELL_PARENTS.has(message.parent_header.msg_type);

    if (own) {
      // An Output widget has claimed this request's output. Only the outputs
      // move: the status, the execution count and the reply still reach the
      // cell below, which is what lets it finish and settle normally.
      const routed = this._outputRoutes?.get(msg_id);
      if (routed && (OUTPUT_TYPES.includes(msg_type) || msg_type === "clear_output")) {
        for (const handler of [...routed]) {
          try {
            handler(message);
          } catch (error) {
            log("ZMQKernel: output route handler failed:", error);
          }
        }
        return;
      }

      // Forward the iopub message to the callback FIRST, before any cleanup
      if (callbackInfo) {
        this._recordRequestProgress(msg_id, callbackInfo);
        // Caught, not rethrown: the status bookkeeping below — idleSeen,
        // retirement, the watchdog's view of the kernel's state — must run
        // whatever a consumer does, and a plugin's middleware is on this
        // path. A throw that skipped it froze the state at busy with the
        // repair mechanisms gated on it ever reading idle again.
        try {
          callbackInfo.callback(message, "iopub");
        } catch (error) {
          // console, not log(): the logger is debug-gated, and a plugin
          // failing on every stream message would otherwise read as output
          // silently going missing.
          console.error("jupyter-repl: iopub callback failed:", error);
        }
      } else if (msg_id && (OUTPUT_TYPES.includes(msg_type) || msg_type === "clear_output")) {
        // No callback left, but the message is ours: output from a background
        // thread, which the kernel attributes to whichever of our cells ran
        // last.
        this._routeOrphanOutput(message);
      }
    }

    if (msg_type === "execute_input" && !suppressStatus) {
      // The kernel has started a cell — whoever asked for it. The count it
      // reports and the per-cell timer restart follow the kernel, not the
      // client; watch refetches (suppressed, ours) leave both alone.
      this.setExecutionCount(message.content.execution_count);
      this.setExecutionStartTime(Date.now());
      this.setLastExecutionTime("Running ...");
    }

    // Applied as the kernel reports it — no renderer reads executionState per
    // bubble any more, so the state needs no ordering against the shell reply.
    if (msg_type === "status") {
      const state = message.content.execution_state;
      // The watchdog's view, ahead of the suppression filter: a busy for a
      // suppressed request is still the kernel telling us its queue is not
      // empty, and a request waiting behind it is queued, not lost.
      this._reportedExecutionState = state;
      this._reportedStatusParent = msg_id ?? null;
      if (state === "idle") {
        this._reportedIdleSince = Date.now();
      }
      const active = this._activeShellRequest
        ? this.executionCallbacks[this._activeShellRequest]
        : null;
      if (active && !active.acknowledged) {
        if (state === "busy") active.idleSince = null;
        else if (state === "idle") active.idleSince ??= Date.now();
      }
      if (callbackInfo && state === "busy" && callbackInfo.expectsReply === false) {
        // A comm's busy is the half of its pair that proves the kernel
        // attended; stamping it moves the entry from the patient
        // nothing-arrived rule to the short repair grace. Without the stamp,
        // a comm whose trailing idle was lost sat behind a gate its own lost
        // frame held shut.
        callbackInfo.halfSettledAt ??= Date.now();
      }
      if (callbackInfo && state === "idle") {
        callbackInfo.idleSeen = true;
        this._retireExecution(msg_id, callbackInfo);
      }
      // Nothing the old process still has in flight describes the kernel any
      // more. A buffered idle draining out of the SUB socket would otherwise
      // put the state back to "idle" over the "restarting" the restart just
      // set — and that is the gate the autocomplete provider consults, so
      // every keystroke would go on sending completions into a dead socket
      // until the new process answered. `finish` sets "idle" itself, once the
      // new one actually does.
      if (
        !this._destroyed &&
        !suppressStatus &&
        this.lifecycle !== "restarting" &&
        this.lifecycle !== "recovering"
      ) {
        this.setExecutionState(state);
      }
    }
  }

  _retireExecution(msgId, callbackInfo) {
    return this._shellRequests().retire(msgId, callbackInfo);
  }

  _settleTrailingIdle(requestId, callbackInfo) {
    return this._shellRequests().settleTrailingIdle(requestId, callbackInfo);
  }

  destroy(forUnload = false) {
    log("ZMQKernel: destroy:", this);

    const discardPending =
      this.lifecycle === "recovering" ||
      this.lifecycle === "unresponsive" ||
      this.lifecycle === "restarting" ||
      this.lifecycle === "shutting-down";
    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;
    this._connectionOwner().rejectInitialization(new Error("The kernel was destroyed."));
    this._cancelReadiness?.();
    this._stopReadyProbe();
    this._stopAckWatchdog();
    this._dismissUnresponsiveNotification();

    // Clear pending state first to prevent errors during shutdown
    const recoveryClosed = this._clearState("Kernel shut down", forUnload, true);
    // Unlike a restart, nothing follows this connection, so the target claims
    // go with it.
    this._comms?.dispose();
    this._comms = null;

    this._connectionOwner().destroy(forUnload, recoveryClosed, discardPending);
    super.destroy();
  }

  _createMessage(msgType, msgId = randomUUID()) {
    return {
      header: {
        username: _getUsername(),
        session: this.sessionId,
        msg_type: msgType,
        msg_id: msgId,
        date: new Date(),
        version: "5.0",
      },
      metadata: {},
      parent_header: {},
      content: {},
    };
  }

  /**
   * Whether the kernel published this message in response to something *we*
   * asked for.
   *
   * A kernel echoes the requesting client's header as `parent_header` — the
   * messaging spec requires it — so its session names the client the work
   * belongs to. Everything else on the socket belongs to some other client: a
   * `jupyter console` sharing the connection file, or a second Lumine window.
   */
  _isOwnMessage(message) {
    return message.parent_header.session === this.sessionId;
  }

  /**
   * Set the last output store for background thread output routing.
   * @param {OutputStore} outputStore - The output store to receive orphan messages
   */
  setLastOutputStore(outputStore) {
    this._lastOutputStore = outputStore ? new WeakRef(outputStore) : null;
  }

  /**
   * Route orphan IOPub output messages to the last active output store.
   * These are messages from background threads that arrive after the kernel goes idle.
   */
  _routeOrphanOutput(message) {
    const outputStore = this._lastOutputStore?.deref();
    if (outputStore) {
      const result = msgSpecToNotebookFormat(message);
      outputStore.appendOutput(result);
    }
  }
}

// Preserve writable inspection fields without constructing resources for a
// bare transport until one of those fields is actually read or assigned.
const CONNECTION_FIELDS = {
  connection: "config",
  connectionFile: "connectionFile",
  kernelProcess: "kernelProcess",
  sessionId: "sessionId",
  options: "options",
  _connectionGeneration: "epoch",
  _everReady: "everReady",
  _expectingExit: "expectingExit",
  _shutdownPromise: "shutdownPromise",
  _restartPromise: "restartPromise",
  _connectionPromise: "connectionPromise",
};
for (const [property, field] of Object.entries(CONNECTION_FIELDS)) {
  Object.defineProperty(ZMQKernel.prototype, property, {
    configurable: true,
    get() {
      return this._connectionOwner()[field];
    },
    set(value) {
      this._connectionOwner()[field] = value;
    },
  });
}
const RECOVERY_FIELDS = {
  _recovery: "current",
  _recoveryClosePromise: "closePromise",
  _quarantinedRequestIds: "quarantinedRequestIds",
  _unresponsiveNotification: "notification",
  _ackWatchdog: "watchdogTimer",
};
for (const [property, field] of Object.entries(RECOVERY_FIELDS)) {
  Object.defineProperty(ZMQKernel.prototype, property, {
    configurable: true,
    get() {
      return this._recoveryOwner()[field];
    },
    set(value) {
      this._recoveryOwner()[field] = value;
    },
  });
}

for (const property of ["shellSocket", "ioSocket", "stdinSocket"]) {
  Object.defineProperty(ZMQKernel.prototype, property, {
    configurable: true,
    get() {
      return this._connectionOwner().sockets[property];
    },
    set(value) {
      this._connectionOwner().sockets[property] = value;
    },
  });
}

function _isValidMessage(message) {
  if (!message) {
    log("Invalid message: null");
    return false;
  }

  if (!message.content) {
    log("Invalid message: Missing content");
    return false;
  }

  if (message.content.execution_state === "starting") {
    // Kernels send a starting status message with an empty parent_header
    log("Dropped starting status IO message");
    return false;
  }

  if (!message.parent_header) {
    log("Invalid message: Missing parent_header");
    return false;
  }

  if (!message.parent_header.msg_id) {
    log("Invalid message: Missing parent_header.msg_id");
    return false;
  }

  if (!message.parent_header.msg_type) {
    log("Invalid message: Missing parent_header.msg_type");
    return false;
  }

  if (!message.header) {
    log("Invalid message: Missing header");
    return false;
  }

  if (!message.header.msg_id) {
    log("Invalid message: Missing header.msg_id");
    return false;
  }

  if (!message.header.msg_type) {
    log("Invalid message: Missing header.msg_type");
    return false;
  }

  return true;
}

function _getUsername() {
  return process.env.LOGNAME || process.env.USER || process.env.LNAME || process.env.USERNAME;
}

module.exports = ZMQKernel;
