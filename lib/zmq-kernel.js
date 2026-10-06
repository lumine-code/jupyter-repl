const { Disposable } = require("lumine");
const { randomUUID } = require("node:crypto");

const Config = require("./config");
const KernelTransport = require("./kernel-transport");
const ShellRequestCoordinator = require("./zmq-shell-requests");
const ZMQConnectionGeneration = require("./zmq-connection-generation");
const { log, js_idx_to_char_idx } = require("./utils");
const { Message, Socket } = require("./jmp");
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

  _recovery = null;
  _recoveryClosePromise = Promise.resolve();
  _quarantinedRequestIds = new Set();
  _unresponsiveNotification = null;
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

  _resolveRestartReady() {
    return this._connectionOwner().resolveRestartReady();
  }

  _rejectRestartReady(error) {
    return this._connectionOwner().rejectRestartReady(error);
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
    if (this.lifecycle === "restarting") {
      this._rejectRestartReady(new Error(reason, { cause: error }));
      return;
    }
    if (this.lifecycle === "loading") {
      lumine.notifications.addError(`${this.displayName}: kernel connection failed`, {
        detail: reason,
        dismissable: true,
      });
      this._terminateFailedStartup();
      return;
    }
    if (this._activeShellRequest) this._quarantine(this._activeShellRequest, reason);
    else this._quarantineBarrier(reason);
  }

  _terminateFailedStartup() {
    return this._connectionOwner().terminateFailedStartup();
  }

  monitorNotifications(childProcess) {
    return this._connectionOwner().monitorProcess(childProcess);
  }

  monitor(done, prev) {
    try {
      // Readiness is judged by the protocol, not by the socket monitor: a
      // kernel is up when it answers on shell and speaks on iopub. The
      // zeromq Observer events stay as a fast path, but they are telemetry
      // riding an inproc monitor socket — after a shutdown-and-start they can
      // fail to construct or simply never fire, and a launch gated on them
      // alone hangs forever with the kernel banner already on screen.
      let shellOk = false;
      let ioOk = false;
      let finished = false;
      // Names this round's probes. A restart owns fresh sockets and a fresh
      // session; the echoed probe id also distinguishes this readiness round
      // from buffered or replayed responses and any earlier round's callbacks.
      this._readyGeneration = (this._readyGeneration ?? 0) + 1;
      const readyGeneration = this._readyGeneration;
      const connectionGeneration = this._connectionGeneration;
      const roundSockets = { shellSocket: this.shellSocket, ioSocket: this.ioSocket };
      const probePrefix = `ready_probe_${readyGeneration}_`;
      let cancelled = false;
      const isCurrentRound = () =>
        !finished &&
        !cancelled &&
        !this._destroyed &&
        this._readyGeneration === readyGeneration &&
        this._connectionGeneration === connectionGeneration &&
        this.shellSocket === roundSockets.shellSocket &&
        this.ioSocket === roundSockets.ioSocket;
      // Undone as soon as readiness is settled. One of these rides `message`,
      // so leaving them on means calling them for every iopub message the
      // kernel ever sends — and a restart registers a fresh pair on the same
      // sockets, so the cost would climb with every restart.
      const readinessListeners = [];

      // Reachable from outside the round too: a failed restart never runs
      // finish(), and its listeners — one riding `message` per socket —
      // otherwise accrue until destroy.
      this._cancelReadiness?.();
      const cancelReadiness = () => {
        cancelled = true;
        for (const { socket, event, listener } of readinessListeners.splice(0)) {
          try {
            socket.removeListener(event, listener);
          } catch (error) {
            log("ZMQKernel: Error removing readiness listener:", error.message);
          }
        }
        if (this._cancelReadiness === cancelReadiness) {
          this._cancelReadiness = null;
        }
      };
      this._cancelReadiness = cancelReadiness;

      const finish = () => {
        if (!isCurrentRound()) {
          return;
        }
        finished = true;
        this._stopReadyProbe();
        this._discardReadyProbes();
        cancelReadiness();
        log("ZMQKernel: all main sockets connected");
        this._everReady = true;
        this.setLifecycle("ready");
        this.setExecutionState("idle");
        // Seed the watchdog's view: a kernel that goes mute from the very
        // first request must still be judged idle, or nothing it ignores
        // would ever settle. The first real status overwrites it, and on a
        // restart it clears the dead process's last word.
        this._reportedExecutionState = "idle";
        this._reportedIdleSince = Date.now();
        // Armed here rather than in `connect`, because `connect` runs once per
        // object and a restart never returns to it — it re-enters `monitor`,
        // which is why the ready probe survives a restart and this did not.
        // The exit handler stops both when a process dies, so a kernel that
        // died and was restarted then served cells with no watchdog at all,
        // and nothing it dropped was ever settled again. Re-arming is safe:
        // `_startAckWatchdog` clears any previous interval first.
        this._startAckWatchdog();
        if (done) {
          done();
        }
      };

      const mark = (socketName, via) => {
        if (!isCurrentRound()) {
          return;
        }
        if (socketName === "shellSocket" && !shellOk) {
          shellOk = true;
          log(`ZMQKernel: shellSocket connected (${via})`);
        } else if (socketName === "ioSocket" && !ioOk) {
          ioOk = true;
          log(`ZMQKernel: ioSocket connected (${via})`);
        }
        if (shellOk && ioOk) {
          finish();
        }
      };

      const monitor = (socketName, socket) => {
        log(
          `ZMQKernel: monitor ${socketName}, isRestart=${!!prev}, isConnected=${socket.isConnected}`,
        );

        // Traffic from this round's kernel_info probe is the readiness proof
        // on both first launch and restart. A socket connect event only says
        // that a process bound the port; completing there can run onStarted
        // before kernel_info_reply has supplied the process's actual language.
        // Requiring the echoed probe also rejects a restarted process's queued
        // stragglers, and still falls back to the kernelspec when the reply has
        // no language_info object.
        const onMessage = (message) => {
          if (!message?.parent_header?.msg_id?.startsWith?.(probePrefix)) return;
          if (socketName === "shellSocket" && message.header?.msg_type === "kernel_info_reply") {
            mark(socketName, "probe reply");
          } else if (
            socketName === "ioSocket" &&
            message.header?.msg_type === "status" &&
            message.content?.execution_state === "idle"
          ) {
            mark(socketName, "probe idle");
          }
        };
        socket.on("message", onMessage);
        readinessListeners.push({ socket, event: "message", listener: onMessage });
      };

      monitor("shellSocket", this.shellSocket);
      monitor("ioSocket", this.ioSocket);

      if (!finished) {
        this._startReadyProbe();
      }
    } catch (err) {
      log("ZMQKernel:", err);
    }
  }

  /**
   * Provoke the traffic that proves readiness: ask for kernel_info until the
   * kernel answers. The requests queue in the DEALER socket until the kernel
   * accepts the connection, so the first one through completes the handshake;
   * replies to the extras are dropped as unknown request ids, which is fine.
   */
  _startReadyProbe() {
    this._stopReadyProbe();
    let remaining = 120; // one minute; past that the kernel is not coming

    const probe = () => {
      if (this._destroyed) {
        this._stopReadyProbe();
        return;
      }
      if (remaining-- <= 0) {
        this._stopReadyProbe();
        this._onReadyProbeExhausted();
        return;
      }
      // Only the newest probe is worth an entry. The handshake needs one
      // request through, not a minute of them accumulating in the callback
      // table — and on a restart the kernel answers the whole queued backlog
      // at once, so every one of them would need reclaiming afterwards.
      this._discardReadyProbes();
      // Stamped with the monitor round that armed this probe: a restart's
      // readiness listeners accept only their own round's echoes.
      const requestId = `ready_probe_${this._readyGeneration ?? 0}_${randomUUID()}`;
      this._readyProbeIds.add(requestId);
      // Suppressed: asking whether the kernel is up is not the user's cell.
      // Left visible, a slow start flashes the status bar every 500 ms, and
      // on a restart — where the watches already exist — each pair fires
      // did-become-idle at a kernel that has not run its startup code yet.
      this._sendDirectShellMessage(
        this._createMessage("kernel_info_request", requestId),
        requestId,
        NOOP,
        true,
      );
    };

    this._readyProbe = setInterval(probe, 500);
    probe();
  }

  /**
   * Forget the probes still outstanding. Their replies are already dropped as
   * unknown request ids; what this reclaims is the callback entries, which
   * nothing else would — the watchdog only settles what a caller is waiting
   * for, and no one waits on a probe.
   */
  _discardReadyProbes() {
    for (const requestId of this._readyProbeIds) {
      delete this.executionCallbacks[requestId];
    }
    this._readyProbeIds.clear();
  }

  /**
   * A minute of unanswered probes: the process is up but the kernel in it is
   * not coming. Left silent — as this was — the kernel hung in "loading" or
   * "restarting" forever, its launch marker stuck in `startingKernels` so
   * every later attempt for the same binding was refused without a word.
   * Killing the mute process routes the failure into the exit handler, which
   * already knows how to announce each phase's death.
   */
  _onReadyProbeExhausted() {
    if (this._destroyed || this.lifecycle === "ready") {
      return;
    }
    log("ZMQKernel: kernel never became ready, giving up");
    // Only a first launch ever holds a marker of its own; during a restart
    // this kernel has no launch marker to clear during a restart.
    if (!this._everReady) {
      this._clearStartingMarker();
    }
    lumine.notifications.addError(`${this.kernelSpec.display_name}: kernel never became ready`, {
      description:
        "The kernel process started but never answered on its sockets. " +
        "Check the kernel's installation, then start it again.",
      dismissable: true,
    });
    if (this.lifecycle === "restarting") {
      // The replacement coroutine owns close-before-kill cleanup.
      this._rejectRestartReady(new Error("Kernel never became ready after restart"));
    } else {
      // No registered Kernel facade owns a failed initial launch, so this
      // transport performs the ordered teardown itself.
      this._terminateFailedStartup();
    }
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

  _kill() {
    return this._connectionOwner().killCurrent();
  }

  _executeStartupCode() {
    // Execute language-specific startup code first
    const languageCode = Config.getJson("startupCodePerLanguage")[this.language];
    if (languageCode) {
      log("KernelManager: Executing startup code for language:", this.language);
      this.execute(languageCode + "\n", () => {});
    }

    // Then execute kernel-specific startup code (with fallback to legacy "startupCode")
    const kernelCode =
      Config.getJson("startupCodePerKernel")[this.displayName] ||
      Config.getJson("startupCode")[this.displayName];
    if (kernelCode) {
      log("KernelManager: Executing startup code for kernel:", this.displayName);
      this.execute(kernelCode + "\n", () => {});
    }

    // For Python kernels - configure the autoreload extension
    if (this.language === "python") {
      const autoreloadMode = lumine.config.get("jupyter-repl.pythonAutoreload");
      if (autoreloadMode !== "off") {
        log("KernelManager: Loading Python autoreload extension");
        this.execute("%load_ext autoreload\n", () => {});
        const printActivity = lumine.config.get("jupyter-repl.pythonAutoreloadPrint");
        const modeCommand = printActivity
          ? `%autoreload ${autoreloadMode} --print`
          : `%autoreload ${autoreloadMode}`;
        this.execute(modeCommand + "\n", () => {});
        log(
          "KernelManager: Autoreload configured:",
          autoreloadMode,
          printActivity ? "(with logging)" : "",
        );
      }
    }
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

    // Executions are already settled by the facade, which aborts them before
    // every caller of this; their synthesized replies are dropped as stale.
    // What is left is everything the facade does not track — a completion, an
    // inspection, a comm_info query — which used to be dropped here in
    // silence, leaving its caller's promise pending for the life of the
    // window. Service consumers wait on one of those.
    //
    // Settled last, once the output routes are gone, so a settled cell's error
    // lands in its own bubble rather than a torn-down Output widget. And never
    // touching the execution state: this does not own it — the restart that
    // just set "restarting", or the destroy on its way out, does.
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
    const state = reason === "Kernel restarted" ? "restarting" : "shutting-down";
    this.setLifecycle(state);
    this.setExecutionState(state);
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
   * How long to wait for the second of a request's two answers once the first
   * has arrived. Far shorter than ACK_IDLE_TIMEOUT_MS, and for a different
   * reason: that one allows for a kernel that has not picked the request up
   * yet, while here the kernel has demonstrably attended to it and one frame
   * went missing. Waiting costs real time — a watch execution holds every
   * watch pane in the window until its idle lands — so this is the floor the
   * poll interval imposes and nothing more.
   */
  static HALF_SETTLED_GRACE_MS = 10000;

  static ACK_POLL_INTERVAL_MS = 500;

  _startAckWatchdog() {
    this._stopAckWatchdog();
    this._ackWatchdog = setInterval(() => {
      if (this._destroyed || (this.lifecycle !== "ready" && this.lifecycle !== "recovering")) {
        return;
      }
      const kernelIdle = this._reportedExecutionState === "idle";
      const now = Date.now();
      const recovery = this._recovery;
      if (this.lifecycle === "recovering" && recovery) {
        const busyProbe = recovery.probes.find((probe) => probe.id === this._reportedStatusParent);
        if (recovery.targetProgress) {
          this._maybeFinishRecovery();
          if (!this.executionCallbacks[recovery.targetId]) {
            if (!this._recovery) return;
            if (!kernelIdle) {
              recovery.barrierIdleSince = null;
              if (busyProbe?.busyAt && now - busyProbe.busyAt >= ZMQKernel.RECOVERY_RETRY_MS) {
                this._quarantineBarrier(
                  "The execution completed, but its recovery probe stopped before replying.",
                );
              }
            } else {
              recovery.barrierIdleSince ??= now;
              if (now - recovery.barrierIdleSince >= ZMQKernel.RECOVERY_RETRY_MS) {
                this._quarantineBarrier(
                  "The execution completed, but a recovery probe never answered.",
                );
              }
            }
            return;
          }
        } else {
          if (!kernelIdle) {
            recovery.idleSince = null;
            recovery.nextProbeAt = null;
            if (busyProbe?.busyAt && now - busyProbe.busyAt >= ZMQKernel.RECOVERY_TIMEOUT_MS) {
              this._quarantine(
                recovery.targetId,
                "The recovery probe was acknowledged but never answered.",
              );
            }
            return;
          }
          if (recovery.idleSince == null) {
            recovery.idleSince = now;
            recovery.nextProbeAt = now + ZMQKernel.RECOVERY_RETRY_MS;
          }
          if (
            recovery.attempts < ZMQKernel.MAX_RECOVERY_PROBES &&
            recovery.nextProbeAt != null &&
            now >= recovery.nextProbeAt
          ) {
            this._runRecoveryProbe();
            recovery.nextProbeAt =
              recovery.attempts < ZMQKernel.MAX_RECOVERY_PROBES
                ? now + ZMQKernel.RECOVERY_RETRY_MS
                : null;
          }
          if (now - recovery.idleSince >= ZMQKernel.RECOVERY_TIMEOUT_MS) {
            this._quarantine(recovery.targetId, "The kernel did not acknowledge this request.");
          }
          return;
        }
      }
      const requestId = this._activeShellRequest;
      const callbackInfo = requestId ? this.executionCallbacks[requestId] : null;
      if (!callbackInfo || callbackInfo.queued) return;

      const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
      const idleDone = callbackInfo.idleSeen || callbackInfo.expectsIdle === false;

      if (replyDone && idleDone) {
        this._finishShellRequest(requestId, callbackInfo);
        return;
      }

      // Once any real message arrives, the kernel demonstrably owns the
      // request. A long execution may then be silent indefinitely and must
      // never be mistaken for a lost request.
      if (!callbackInfo.acknowledged) {
        if (!kernelIdle) callbackInfo.idleSince = null;
        else callbackInfo.idleSince ??= now;
        if (
          this.lifecycle === "ready" &&
          kernelIdle &&
          now - callbackInfo.idleSince >= ZMQKernel.ACK_PROBE_AFTER_MS
        ) {
          this._beginRecovery(requestId);
        }
        return;
      }

      // Exactly one terminal half arrived. A real reply proves the outcome,
      // so a missing idle can be supplied. An idle without the reply leaves
      // the execution outcome unknown and poisons the shell connection.
      if (!callbackInfo.replySeen && !callbackInfo.idleSeen && !callbackInfo.halfSettledAt) {
        return;
      }
      const quietSince = Math.max(
        callbackInfo.halfSettledAt ?? callbackInfo.armedAt,
        callbackInfo.lastProgressAt,
      );
      if (now - quietSince <= ZMQKernel.HALF_SETTLED_GRACE_MS) {
        return;
      }
      if (replyDone) {
        log("ZMQKernel: trailing idle never arrived, supplying it:", requestId);
        this._settleTrailingIdle(requestId, callbackInfo);
      } else {
        this._quarantine(
          requestId,
          "The kernel finished the request but its shell reply was lost.",
          { skipIdle: true },
        );
      }
    }, ZMQKernel.ACK_POLL_INTERVAL_MS);
  }

  _recordRequestProgress(requestId, callbackInfo) {
    callbackInfo.acknowledged = true;
    callbackInfo.lastProgressAt = Date.now();
    const recovery = this._recovery;
    if (!recovery || recovery.targetId !== requestId || recovery.targetProgress) return;
    recovery.targetProgress = true;
    this._maybeFinishRecovery();
  }

  _beginRecovery(requestId) {
    if (this._recovery || this.lifecycle !== "ready") return;
    const entry = this.executionCallbacks[requestId];
    if (!entry || entry.acknowledged || entry.queued) return;

    log("ZMQKernel: shell request unacknowledged, recovering:", requestId);
    this.setLifecycle("recovering");
    this.setExecutionState("recovering");
    const recovery = {
      targetId: requestId,
      targetProgress: false,
      attempts: 0,
      probes: [],
      idleSince: Date.now(),
      nextProbeAt: Date.now() + ZMQKernel.RECOVERY_RETRY_MS,
      barrierIdleSince: null,
    };
    this._recovery = recovery;
    this._runRecoveryProbe();
    this._cancelQueuedRequests(
      () => true,
      "ExecutionCancelled",
      "The request was not sent because the kernel connection entered recovery.",
    );
  }

  _runRecoveryProbe() {
    const recovery = this._recovery;
    if (
      !recovery ||
      recovery.targetProgress ||
      recovery.attempts >= ZMQKernel.MAX_RECOVERY_PROBES ||
      !this.connection
    ) {
      return;
    }
    recovery.attempts++;

    const scheme = this.connection.signature_scheme.slice("hmac-".length);
    const socket = this._createRecoverySocket(scheme, this.connection.key);
    const probeSession = randomUUID();
    const probeId = `recovery_probe_${this._connectionGeneration}_${randomUUID()}`;
    socket.identity = `recovery${randomUUID()}`;
    const probe = {
      socket,
      id: probeId,
      session: probeSession,
      replySeen: false,
      idleSeen: false,
    };
    recovery.probes.push(probe);

    socket.on("message", (message) => {
      const current = this._recovery;
      if (
        !current ||
        !current.probes.includes(probe) ||
        message?.parent_header?.msg_id !== probeId ||
        message?.parent_header?.session !== probeSession
      ) {
        return;
      }
      probe.replySeen = true;
      probe.closedPromise = this._connectionOwner()
        .retireSocket(probe.socket, false, true)
        .then(() => {
          probe.closed = true;
          if (this._reportedStatusParent === probe.id && this._reportedExecutionState === "busy") {
            this._reportedExecutionState = "idle";
            this._reportedIdleSince = Date.now();
          }
          if (
            this._recovery?.quarantined &&
            this._recovery.probes.every((candidate) => candidate.closed)
          ) {
            this._clearRecovery();
            return;
          }
          this._maybeFinishRecovery();
        });
    });
    const address = `${this.connection.transport}://${this.connection.ip}:${this.connection.shell_port}`;
    socket.connect(address);
    const message = this._createMessage("kernel_info_request", probeId);
    message.header.session = probeSession;
    socket.send(new Message(message)).catch((error) => {
      log("ZMQKernel: recovery probe send failed:", error);
    });
  }

  _createRecoverySocket(scheme, key) {
    return new Socket("dealer", scheme, key, { monitor: false, linger: 0 });
  }

  _handleRecoveryProbeIO(message) {
    const probe = this._recovery?.probes.find(
      (candidate) =>
        message?.parent_header?.msg_id === candidate.id &&
        message?.parent_header?.session === candidate.session,
    );
    if (!probe) {
      return false;
    }
    if (message.header?.msg_type === "status" && message.content?.execution_state === "idle") {
      probe.idleSeen = true;
      this._maybeFinishRecovery();
    } else if (
      message.header?.msg_type === "status" &&
      message.content?.execution_state === "busy"
    ) {
      probe.busyAt ??= Date.now();
    }
    return true;
  }

  _maybeFinishRecovery() {
    const recovery = this._recovery;
    if (!recovery || !recovery.targetProgress) return;
    const targetDone = !this.executionCallbacks[recovery.targetId];
    const probesDone =
      recovery.probes.length > 0 &&
      recovery.probes.every((probe) => probe.replySeen && probe.idleSeen && probe.closed);
    if (!targetDone || !probesDone) {
      return;
    }

    this._completeRecovery(recovery);
  }

  _completeRecovery(recovery) {
    if (this._recovery !== recovery) return;
    log("ZMQKernel: shell connection recovered:", recovery.targetId);
    this._clearRecovery().then(() => {
      if (this._destroyed || this.lifecycle === "unresponsive" || this.lifecycle === "restarting") {
        return;
      }
      this.setLifecycle("ready");
      if (this.executionState === "recovering") {
        this.setExecutionState(this._reportedExecutionState || "idle");
      }
      this._drainShellQueue();
    });
  }

  _closeRecoveryProbes(forUnload = false) {
    const probes = this._recovery?.probes || [];
    if (this._recovery) this._recovery.probes = [];
    return Promise.all(
      probes.map((probe) => {
        try {
          probe.socket.removeAllListeners();
          return this._connectionOwner().retireSocket(probe.socket, forUnload, true);
        } catch (error) {
          log("ZMQKernel: recovery probe close failed:", error);
          return Promise.resolve();
        }
      }),
    );
  }

  _clearRecovery(forUnload = false) {
    const recovery = this._recovery;
    if (!recovery) return this._recoveryClosePromise || Promise.resolve();
    const closed = this._closeRecoveryProbes(forUnload);
    this._recovery = null;
    const previous = this._recoveryClosePromise || Promise.resolve();
    this._recoveryClosePromise = Promise.all([previous, closed]).then(() => {});
    return this._recoveryClosePromise;
  }

  _quarantine(requestId, reason, options = {}) {
    if (this.lifecycle === "unresponsive" || this._destroyed) return;
    log("ZMQKernel: quarantining unresponsive shell connection:", requestId, reason);
    if (this._recovery) this._recovery.quarantined = true;
    this.setLifecycle("unresponsive");
    this.setExecutionState("unresponsive");
    this._cancelQueuedRequests(
      () => true,
      "ExecutionCancelled",
      "The request was not sent because the kernel connection is quarantined.",
    );

    const entry = requestId ? this.executionCallbacks[requestId] : null;
    if (entry) {
      delete this.executionCallbacks[requestId];
      this._quarantinedRequestIds.add(requestId);
      if (this._activeShellRequest === requestId) this._activeShellRequest = null;
      const execute = entry.requestType === "execute_request";
      this._settlePending(
        requestId,
        entry,
        execute ? "ExecutionOutcomeUnknown" : "KernelUnresponsive",
        execute
          ? `${reason} It may still execute; restart the kernel before continuing.`
          : `${reason} Restart the kernel before continuing.`,
        { ...options, updateStatus: false },
      );
    }
    this._showUnresponsiveNotification(reason, true);
  }

  _quarantineBarrier(reason) {
    if (this.lifecycle === "unresponsive" || this._destroyed) return;
    if (this._recovery) this._recovery.quarantined = true;
    this.setLifecycle("unresponsive");
    this.setExecutionState("unresponsive");
    this._showUnresponsiveNotification(reason, false);
  }

  _showUnresponsiveNotification(reason, outcomeUnknown = true) {
    if (this._unresponsiveNotification) return;
    const findKernel = () =>
      require("./store").runningKernels.find((kernel) => kernel.transport === this);
    this._unresponsiveNotification = lumine.notifications.addError(
      `${this.displayName}: kernel connection is unresponsive`,
      {
        description: outcomeUnknown
          ? "A sent request may still execute later. The connection has been quarantined; restart or shut down the kernel before continuing."
          : "The completed request has a known outcome, but the connection cannot be reused safely. Restart or shut down the kernel before continuing.",
        detail: reason,
        dismissable: true,
        buttons: [
          {
            text: "Restart Kernel",
            onDidClick: () => findKernel()?.restart(),
          },
          {
            text: "Shut Down Kernel",
            onDidClick: () => findKernel()?.shutdownAndDestroy(),
          },
        ],
      },
    );
  }

  _stopAckWatchdog() {
    if (this._ackWatchdog) {
      clearInterval(this._ackWatchdog);
      this._ackWatchdog = null;
    }
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

    const message = this._createMessage("execute_request", requestId);
    message.content = {
      code,
      silent: options.silent ?? false,
      store_history: options.store_history ?? true,
      user_expressions: {},
      allow_stdin: options.allow_stdin ?? true,
    };

    this._sendShellMessage(message, requestId, onResults, options.suppressStatus ?? false);
  }

  /**
   * Execute code for watch pane - gets output but doesn't affect status bar or history.
   */
  executeWatch(code, onResults) {
    this.execute(code, onResults, {
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
  }

  inspect(code, cursorPos, onResults) {
    log("ZMQKernel.inspect:", code, cursorPos);
    const requestId = `inspect_${randomUUID()}`;

    const message = this._createMessage("inspect_request", requestId);

    message.content = {
      code,
      cursor_pos: cursorPos,
      detail_level: 0,
    };
    // Suppress status to avoid "busy" flash during inspection
    this._sendShellMessage(message, requestId, onResults, true);
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
      lumine.notifications.addError(`${this.kernelSpec.display_name}: input reply not delivered`, {
        description:
          "The kernel is waiting for input, but the reply could not be sent. " +
          "Interrupt or restart the kernel to continue.",
        detail: error.message,
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
    this._rejectRestartReady(new Error("Kernel was destroyed during restart"));
    this._stopReadyProbe();
    this._stopAckWatchdog();
    this._unresponsiveNotification?.dismiss?.();
    this._unresponsiveNotification = null;

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
  _restartReadyResolve: "restartReadyResolve",
  _restartReadyReject: "restartReadyReject",
  _fatalCleanupPromise: "fatalCleanupPromise",
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
