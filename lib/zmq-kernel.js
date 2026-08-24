const fs = require("fs");
const { Disposable } = require("lumine");
const { v4: uuidv4 } = require("uuid");

const { launchSpec, launchSpecFromConnectionInfo } = require("./kernel-launcher");
const Config = require("./config");
const KernelTransport = require("./kernel-transport");
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

  executionCallbacks = {};
  // Request ids of the readiness probes still outstanding, so their callback
  // entries can be reclaimed rather than left for the watchdog to puzzle over.
  _readyProbeIds = new Set();
  _connectionPromise = null;
  // Last output store for background thread output (WeakRef to avoid memory leaks)
  _lastOutputStore = null;
  // This client's Jupyter session id. The protocol stamps it on every request
  // we send, and the kernel copies it into the `parent_header` of everything it
  // publishes in response — which is what lets us tell our own traffic apart
  // from another client's on a shared kernel. It must therefore be unique per
  // connection: two Lumine windows on one kernel are two clients.
  sessionId = uuidv4();
  // The kernel's execution state exactly as published on iopub, before the
  // suppression filter — our own watch refetches and comm messages included.
  // `executionState` deliberately ignores suppressed traffic so a watch cannot
  // flash the status bar, but the kernel is exactly as busy running a watch or
  // a widget callback as running a cell, and the acknowledgment watchdog must
  // judge idleness against what the kernel is actually doing, or it settles
  // requests that are merely queued behind that invisible work.
  _reportedExecutionState = null;
  _reportedIdleSince = null;

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar);
    this.options = options || {};
    // Otherwise the launcher deletes the file on exit and restarting the kernel,
    // which reuses the same connection info, fails.
    options.cleanupConnectionFile = false;

    launchSpec(kernelSpec, options)
      .then(({ config, connectionFile, spawn }) => {
        this.connection = config;
        this.connectionFile = connectionFile;
        this.kernelProcess = spawn;
        this.monitorNotifications(spawn);
        this.connect(() => {
          this._executeStartupCode();
          if (onStarted) {
            onStarted(this);
          }
        });
      })
      .catch((error) => {
        log("ZMQKernel: Failed to launch kernel:", error);
        lumine.notifications.addError(`Failed to start kernel: ${this.kernelSpec.display_name}`, {
          detail: error.message,
          dismissable: true,
        });
        // Clear starting state so user can retry
        const store = require("./store");
        store.startingKernels.delete(this.kernelSpec.display_name);
      });
  }

  connect(done) {
    const scheme = this.connection.signature_scheme.slice("hmac-".length);
    const { key } = this.connection;
    this.shellSocket = new Socket("dealer", scheme, key);
    this.stdinSocket = new Socket("dealer", scheme, key);
    this.ioSocket = new Socket("sub", scheme, key);
    const id = uuidv4();
    this.shellSocket.identity = `dealer${id}`;
    this.stdinSocket.identity = `dealer${id}`;
    // this.ioSocket.identity = `sub${id}`
    const address = `${this.connection.transport}://${this.connection.ip}:`;
    this.shellSocket.connect(address + this.connection.shell_port);
    this.ioSocket.connect(address + this.connection.iopub_port);
    this.ioSocket.subscribe("");
    this.stdinSocket.connect(address + this.connection.stdin_port);
    this.shellSocket.on("message", this.onShellMessage.bind(this));
    this.ioSocket.on("message", this.onIOMessage.bind(this));
    this.stdinSocket.on("message", this.onStdinMessage.bind(this));

    this.monitor(done);
  }

  monitorNotifications(childProcess) {
    childProcess.stdout.on("data", (data) => {
      data = data.toString();

      if (lumine.config.get("jupyter-repl.kernelNotifications")) {
        lumine.notifications.addInfo(this.kernelSpec.display_name, {
          description: data,
          dismissable: true,
        });
      } else {
        log("ZMQKernel: stdout:", data);
      }
    });
    childProcess.stderr.on("data", (data) => {
      // ipykernel >= 7.3 logs a benign warning to stderr when a kernel uses plaintext
      // TCP on localhost. It's expected here (IPC/CurveZMQ aren't provisioned) and not
      // actionable, so drop just that line. Filter line-by-line so a real error bundled
      // in the same stderr chunk still surfaces.
      const text = data
        .toString()
        .split(/\r?\n/)
        .filter((line) => !/running over TCP without encryption/i.test(line))
        .join("\n")
        .trim();
      if (!text) {
        return;
      }
      // ipykernel logs to stderr as "[AppName] LEVEL | message". Route by that level so
      // warnings/info don't masquerade as errors. Unprefixed output (e.g. native
      // tracebacks) has no level and defaults to error so nothing important is hidden.
      switch (_ipythonLogLevel(text)) {
        case "WARNING":
          lumine.notifications.addWarning(this.kernelSpec.display_name, {
            description: text,
            dismissable: true,
          });
          break;
        case "INFO":
        case "DEBUG":
          log("ZMQKernel: stderr:", text);
          break;
        default:
          lumine.notifications.addError(this.kernelSpec.display_name, {
            description: text,
            dismissable: true,
          });
      }
    });
    // Monitor process exit to clean up state if kernel crashes during startup
    childProcess.on("exit", (code, signal) => {
      log(`ZMQKernel: process exited with code ${code}, signal ${signal}`);
      // A restart spawns a new process and registers a second set of these
      // handlers, but the old child keeps its own and still fires exit once.
      // That straggler describes a process this kernel has already replaced,
      // and every branch below acts on the *current* one — stopping its
      // timers, closing its sockets, deleting its connection file. Which
      // child died is the question; `lifecycle` was only ever a proxy for it,
      // and the proxy is wrong once the new process has reached ready.
      if (this.kernelProcess !== childProcess) {
        log("ZMQKernel: ignoring the exit of a process already replaced");
        return;
      }
      // If kernel exits before fully started (still in startingKernels), clean up
      const store = require("./store");
      // A restart kills the old process and arms the new one's probe before
      // this event is delivered, so only stop the timers when the kernel is
      // actually gone. Left running, the ready probe keeps sending into a
      // dead socket every 500 ms for a minute — each send settling as a
      // failure and broadcasting a status — and the ack watchdog's interval
      // holds the whole kernel, sockets and all, for the life of the window.
      const kernelIsGone =
        store.startingKernels.has(this.kernelSpec.display_name) ||
        (!this._destroyed && this.lifecycle !== "restarting");
      if (kernelIsGone) {
        this._stopReadyProbe();
        this._stopAckWatchdog();
      }

      if (store.startingKernels.has(this.kernelSpec.display_name)) {
        store.startingKernels.delete(this.kernelSpec.display_name);
        if (code !== 0 && !this._destroyed) {
          lumine.notifications.addError(`${this.kernelSpec.display_name}`, {
            detail: `Process exited with code ${code}${signal ? `, signal ${signal}` : ""}`,
            dismissable: true,
          });
        }
        // Close sockets to prevent them from reconnecting to a new kernel
        // (ZMQ auto-reconnect + OS port reuse could cause signature mismatches)
        this._releaseSockets(false);

        // Also clean up connection file to avoid stale files
        if (this.connectionFile) {
          try {
            fs.unlinkSync(this.connectionFile);
          } catch (e) {
            // Ignore - file might not exist or already deleted
          }
          this.connectionFile = null;
        }
      } else if (!this._destroyed && this.lifecycle !== "restarting") {
        // The kernel process is gone after startup — died on a native crash,
        // was killed from outside, or exited cleanly under a running cell.
        // Either way no reply will ever arrive: settle the outstanding
        // executions first, while their callbacks still exist.
        this.setLifecycle("dead");
        this.emitDidLoseKernel("Kernel process exited");
        if (code !== 0 && code !== null) {
          const codeHex = code > 255 ? ` (0x${(code >>> 0).toString(16).toUpperCase()})` : "";
          lumine.notifications.addError(`${this.kernelSpec.display_name}: kernel process died`, {
            description:
              "The kernel process exited unexpectedly while running. " +
              "Restart the kernel to continue working.",
            detail: `Exit code ${code}${codeHex}${signal ? `, signal ${signal}` : ""}`,
            dismissable: true,
          });
        }
        this._clearState("Kernel process exited");
      }
    });
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
      // Names this round's probes, so a restart can tell the new process's
      // answers from everything else on the wire. The sockets stay connected
      // across a restart and keep draining what the killed process left
      // behind — replies to our own old requests, buffered statuses — and
      // every one of those carries our session, so neither the channel nor
      // the session can tell them apart. A reply parented to a probe *this*
      // round sent is the one thing the old process cannot produce.
      this._readyGeneration = (this._readyGeneration ?? 0) + 1;
      const probePrefix = `ready_probe_${this._readyGeneration}_`;
      // Undone as soon as readiness is settled. One of these rides `message`,
      // so leaving them on means calling them for every iopub message the
      // kernel ever sends — and a restart registers a fresh pair on the same
      // sockets, so the cost would climb with every restart.
      const readinessListeners = [];

      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        this._stopReadyProbe();
        this._discardReadyProbes();
        for (const { socket, event, listener } of readinessListeners.splice(0)) {
          try {
            socket.removeListener(event, listener);
          } catch (error) {
            log("ZMQKernel: Error removing readiness listener:", error.message);
          }
        }
        log("ZMQKernel: all main sockets connected");
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
        if (finished || this._destroyed) {
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

        // For initial connection only: if socket is already connected, proceed
        // immediately. During restart (prev=true), we MUST wait for the
        // reconnection to the NEW kernel.
        if (!prev && socket.isConnected) {
          mark(socketName, "monitor");
          return;
        }
        // Traffic is ground truth: a reply proves shell, any iopub message
        // proves iopub, whatever the monitor thinks. On a restart, only the
        // traffic this round's probes provoke counts — anything else on the
        // socket may be the dead process's backlog, and a straggler that
        // completed readiness here put the kernel at "ready" with nothing
        // behind the ports. The probe pings every 500 ms, so requiring its
        // echo costs at most one tick; both channels carry it, since the
        // kernel publishes the busy/idle pair around the reply.
        const onMessage = prev
          ? (message) => {
              if (message?.parent_header?.msg_id?.startsWith?.(probePrefix)) {
                mark(socketName, "probe");
              }
            }
          : () => mark(socketName, "traffic");
        socket.on("message", onMessage);
        readinessListeners.push({ socket, event: "message", listener: onMessage });
        if (!prev) {
          // The Observer's connect event stays as a first-launch fast path.
          // On a restart it is not evidence: the sockets reconnect the moment
          // the new process binds its ports, which says nothing about the
          // kernel behind them answering yet.
          const onConnect = () => mark(socketName, "monitor");
          socket.on("connect", onConnect);
          readinessListeners.push({ socket, event: "connect", listener: onConnect });
        }
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
      if (this._destroyed || remaining-- <= 0) {
        this._stopReadyProbe();
        return;
      }
      // Only the newest probe is worth an entry. The handshake needs one
      // request through, not a minute of them accumulating in the callback
      // table — and on a restart the kernel answers the whole queued backlog
      // at once, so every one of them would need reclaiming afterwards.
      this._discardReadyProbes();
      // Stamped with the monitor round that armed this probe: a restart's
      // readiness listeners accept only their own round's echoes.
      const requestId = `ready_probe_${this._readyGeneration ?? 0}_${uuidv4()}`;
      this._readyProbeIds.add(requestId);
      // Suppressed: asking whether the kernel is up is not the user's cell.
      // Left visible, a slow start flashes the status bar every 500 ms, and
      // on a restart — where the watches already exist — each pair fires
      // did-become-idle at a kernel that has not run its startup code yet.
      this._sendShellMessage(
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
    log("ZMQKernel: sending SIGKILL");
    this.kernelProcess.kill("SIGKILL");
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
  async shutdown() {
    await this._socketShutdown();
  }

  restart(onRestarted) {
    this._socketRestart(onRestarted);
  }

  /** How long a kernel gets to exit on its own before `destroy` kills it. */
  static SHUTDOWN_TIMEOUT_MS = 2000;

  async _socketShutdown() {
    const requestId = `shutdown_${uuidv4()}`;

    const message = this._createMessage("shutdown_request", requestId);
    message.content = { restart: false };

    // Sent directly rather than through `_sendShellMessage`: that registers a
    // callback entry and makes the send conditional on the entry still being
    // there when its turn comes. For every other request that check is right,
    // but the teardown it guards against is exactly the one this request is
    // supposed to precede — `destroy` clears the table in the same tick, so
    // the send was skipped as stale every single time.
    try {
      await this.shellSocket.send(new Message(message));
    } catch (error) {
      log("ZMQKernel: Error sending shutdown request:", error);
      return;
    }

    // Closed here, not left for `destroy`: the sockets must go down while
    // the peer still lives, and waiting for the exit first inverts that. The
    // kernel is alive right now, running its own teardown — an orderly
    // disconnect. After it exits, every close lands in the RST storm of a
    // dead process, which on Windows corrupts libzmq's shared io thread —
    // and every socket created afterwards, the next kernel's included, never
    // connects at all. `destroy`'s own close-before-kill ordering states the
    // same invariant.
    this._releaseSockets(false);

    await this._awaitProcessExit(ZMQKernel.SHUTDOWN_TIMEOUT_MS);
  }

  /**
   * Detach and close all three sockets, exactly once. The refs are nulled so
   * a later teardown — `destroy` after a graceful shutdown — finds nothing
   * left to close.
   */
  _releaseSockets(forUnload) {
    for (const name of ["shellSocket", "ioSocket", "stdinSocket"]) {
      const socket = this[name];
      if (!socket) {
        continue;
      }
      this[name] = null;
      try {
        // Listeners first, so nothing fires into a closing socket.
        socket.removeAllListeners();
        socket.close(forUnload);
      } catch (e) {
        log(`ZMQKernel: Error closing ${name}:`, e.message);
      }
    }
  }

  /** Resolve when the kernel process exits, or when the wait runs out. */
  _awaitProcessExit(timeoutMs) {
    const child = this.kernelProcess;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        child.removeListener?.("exit", done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      child.once?.("exit", done);
    });
  }

  // Clear all pending state (used in restart and destroy)
  _clearState(reason = "Kernel state cleared") {
    // Taken whole and replaced before anything is notified, so a callback that
    // arms a fresh request keeps it — the same shape `Kernel#abortInFlight`
    // uses, and the reason `_settlePending` exists apart from the lookup in
    // `_settleUnanswered`.
    const pending = Object.entries(this.executionCallbacks);
    this.executionCallbacks = {};
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
    // window. The MCP inspect tool waits on one of those.
    //
    // Settled last, once the output routes are gone, so a settled cell's error
    // lands in its own bubble rather than a torn-down Output widget. And never
    // touching the execution state: this does not own it — the restart that
    // just set "restarting", or the destroy on its way out, does.
    for (const [requestId, callbackInfo] of pending) {
      this._settlePending(requestId, callbackInfo, "KernelGone", reason, { updateStatus: false });
    }
  }

  _socketRestart(onRestarted) {
    // Keyed on our own lifecycle, not on executionState: that field follows
    // every client's traffic, so a foreign busy or idle arriving mid-restart
    // must not open the door to a second, overlapping restart.
    if (this.lifecycle === "restarting") {
      return;
    }

    this.setLifecycle("restarting");
    this.setExecutionState("restarting");
    this._clearState("Kernel restarted");

    // Kill the old process (shutdown message is often not received anyway during restart)
    this._kill();

    const { spawn } = launchSpecFromConnectionInfo(
      this.kernelSpec,
      this.connection,
      this.connectionFile,
      this.options,
    );
    this.kernelProcess = spawn;
    this.monitorNotifications(spawn);
    this.monitor(() => {
      this._executeStartupCode();

      if (onRestarted) {
        onRestarted();
      }
    }, true);
  }

  /**
   * Register the request's callback and send it on the shell socket. The
   * socket serializes its own sends and the kernel queues and answers
   * requests in order, so there is no client-side queue to manage — a request
   * waits at the kernel, behind whatever any client is running.
   */
  async _sendShellMessage(message, requestId, onResults, suppressStatus = false, options = {}) {
    this.executionCallbacks[requestId] = {
      callback: onResults,
      suppressStatus,
      requestType: message.header.msg_type,
      // Whether the kernel answers this on the shell channel at all. Every
      // request does except a comm message, which it acknowledges only with
      // the busy/idle pair it publishes around any shell message. An entry
      // waiting for a reply that is never coming would be stranded for the
      // life of the connection, and a dragged slider sends one per frame.
      expectsReply: options.expectsReply !== false,
      // The mirror of `expectsReply`, for the rare kernel that answers a
      // request without publishing the trailing idle around it. Defaults true
      // everywhere: which requests get a status pair is a property of the
      // channel, not of the request type — ipykernel and xeus alike publish
      // busy around every shell message and idle once its handler returns.
      expectsIdle: options.expectsIdle !== false,
      // Every request is answered twice — shell reply and trailing iopub idle
      // — and its callback lives until both have arrived (_retireExecution).
      replySeen: false,
      idleSeen: false,
      // When exactly one of the two arrived, so a lost frame can be made good
      // rather than stranding the entry (see the watchdog).
      halfSettledAt: null,
      // For the acknowledgment watchdog: bumped by every message the kernel
      // sends about this request, on any channel.
      lastProgressAt: Date.now(),
      armedAt: Date.now(),
    };
    try {
      // The staleness check covers a send whose turn comes only after its
      // request was already settled — by the watchdog, a restart, or a
      // failure — while a full socket held the chain up. Delivering it then
      // would re-execute work whose caller already saw it fail.
      await this.shellSocket.send(new Message(message), () => !this.executionCallbacks[requestId]);
    } catch (error) {
      log("ZMQKernel: Error sending shell message:", error);
      this._settleUnanswered(
        requestId,
        message.header?.msg_type,
        "SendError",
        error.message || "Failed to send message to kernel",
      );
    }
  }

  /**
   * A kernel with an empty queue acknowledges a request within milliseconds,
   * so a request still unacknowledged after the kernel has sat idle this long
   * was lost, not queued. Deliberately conditioned on idleness: while any
   * client's cell runs, a queued request legitimately hears nothing for as
   * long as that cell takes, and no fixed timeout can be right there.
   *
   * Idleness is `_reportedExecutionState`, never `executionState`: the
   * status-bar view is blind to our own suppressed work by design, and a
   * cell queued behind a slow watch refetch or widget callback would read as
   * ignored by an idle kernel — settled as lost here, then executed by the
   * kernel anyway once its turn came.
   *
   * A comm message normally shows progress from the same busy status any
   * request does, so this never sees one. A kernel that publishes no status
   * for comm messages is the exception, and there _settleUnanswered reclaims
   * the entry silently — there is no caller waiting to be told.
   */
  static ACK_IDLE_TIMEOUT_MS = 30000;

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

  /** Anything below this and a grace period is unenforceable. */
  static ACK_POLL_INTERVAL_MS = 10000;

  _startAckWatchdog() {
    this._stopAckWatchdog();
    this._ackWatchdog = setInterval(() => {
      if (this._destroyed || this.lifecycle !== "ready") {
        return;
      }
      const kernelIdle = this._reportedExecutionState === "idle";
      const now = Date.now();
      for (const [requestId, callbackInfo] of Object.entries(this.executionCallbacks)) {
        const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
        const idleDone = callbackInfo.idleSeen || callbackInfo.expectsIdle === false;

        if (replyDone && idleDone) {
          // Normally unreachable — _retireExecution deletes on the message
          // that completes the pair. It is reached by a request declared to
          // expect neither answer, which nothing would ever call it for.
          delete this.executionCallbacks[requestId];
          continue;
        }

        // Branched on what has ARRIVED, never on what a declaration excuses:
        // a comm is born with its reply excused, and classing that as
        // half-answered gave it the short grace — from a null stamp, so no
        // grace at all — where an unacknowledged comm belongs under the same
        // patient rule as everything else the kernel has not touched.
        if (!callbackInfo.replySeen && !callbackInfo.idleSeen) {
          // The kernel has said nothing at all about this request, or said
          // something and then went quiet mid-execution. Only judged while
          // the kernel reports idle — a queued request legitimately hears
          // nothing for as long as anyone's cell runs — and only over the
          // stretch in which it was idle and had the request.
          if (!kernelIdle) {
            continue;
          }
          const unattendedSince = Math.max(
            callbackInfo.lastProgressAt,
            this._reportedIdleSince ?? now,
          );
          if (now - unattendedSince > ZMQKernel.ACK_IDLE_TIMEOUT_MS) {
            log("ZMQKernel: request never acknowledged, settling:", requestId);
            this._settleUnanswered(
              requestId,
              callbackInfo.requestType,
              "NoReplyError",
              "The kernel never acknowledged this request. Restart the kernel if this persists.",
            );
          }
          continue;
        }

        // Exactly one answer arrived. Deliberately NOT gated on the kernel
        // reporting idle: when the lost frame is the trailing idle of the
        // last request, that report is stuck at busy — the gate would wait
        // forever on the very frame this branch exists to replace. Quiet is
        // judged per entry instead: iopub is ordered, so any later message
        // for this request would have bumped `lastProgressAt`, and a stream
        // still arriving keeps postponing the repair. Timed from the moment
        // the first answer came, never from `_reportedIdleSince` — that is
        // refreshed by every idle from every client and by our own
        // suppressed traffic, so a dragged slider would starve this branch
        // for as long as the drag lasted.
        const quietSince = Math.max(
          callbackInfo.halfSettledAt ?? callbackInfo.armedAt,
          callbackInfo.lastProgressAt,
        );
        if (now - quietSince <= ZMQKernel.HALF_SETTLED_GRACE_MS) {
          continue;
        }
        if (replyDone) {
          // The caller has its answer and is waiting only on the idle, which
          // is what releases a watch's hold and resolves a batch's promise.
          // Synthesizing a whole error reply here would deliver a second one.
          log("ZMQKernel: trailing idle never arrived, supplying it:", requestId);
          this._settleTrailingIdle(requestId, callbackInfo);
        } else {
          // The idle came and the reply never will, so the caller is still
          // waiting — but it already had its idle, and a second would be
          // a duplicate.
          log("ZMQKernel: reply never arrived after the idle, settling:", requestId);
          this._settleUnanswered(
            requestId,
            callbackInfo.requestType,
            "NoReplyError",
            "The kernel finished this request without answering it.",
            { skipIdle: true },
          );
        }
      }
    }, ZMQKernel.ACK_POLL_INTERVAL_MS);
  }

  _stopAckWatchdog() {
    if (this._ackWatchdog) {
      clearInterval(this._ackWatchdog);
      this._ackWatchdog = null;
    }
  }

  /**
   * Settle a request the kernel will never answer — its send failed outright,
   * or it went unacknowledged through an idle stretch long enough to prove it
   * lost. Synthesizes the error output, the reply, and the trailing idle an
   * awaiting caller resolves on, then retires the callback.
   *
   * @param {Object} [options]
   * @param {Boolean} [options.skipIdle] - Omit the trailing idle, for a
   *   request whose idle already arrived and whose reply is what went
   *   missing. Delivering a second one would be a duplicate.
   * @param {Boolean} [options.updateStatus] - Whether settling may move the
   *   execution state. False for a caller that owns that state itself.
   */
  _settleUnanswered(requestId, requestType, ename, evalue, options = {}) {
    const callbackInfo = this.executionCallbacks[requestId];
    if (!callbackInfo) {
      return;
    }
    delete this.executionCallbacks[requestId];
    this._settlePending(requestId, callbackInfo, ename, evalue, {
      requestType,
      ...options,
    });
  }

  /**
   * The synthesis half of `_settleUnanswered`, operating on an entry the
   * caller already holds. Split out because a caller that has taken the whole
   * table at once cannot look entries up any more — see `_clearState`.
   */
  _settlePending(requestId, callbackInfo, ename, evalue, options = {}) {
    const requestType = callbackInfo.requestType ?? options.requestType;
    // A request with no reply to wait for has no awaiting caller to unblock.
    // Synthesizing an error output, a reply and an idle for a comm message
    // would push three messages into a callback that never asked for one, and
    // drag the status bar to idle on a kernel that may well be busy.
    if (callbackInfo.expectsReply === false) {
      log("ZMQKernel: comm request went unacknowledged:", requestType, evalue);
      return;
    }

    const parent_header = {
      msg_id: requestId,
      msg_type: requestType || "execute_request",
    };
    // Named after the request it answers. Every request type reaches this now
    // that they all retire the same way, and a `complete_request` answered by
    // an `execute_reply` is a message that lies about what it is — harmless
    // to the callers in this repository, not to a plugin's middleware.
    const replyType = parent_header.msg_type.replace(/_request$/, "_reply");
    // Only the halves that never arrived are made good. A half-settled entry
    // reaching here — `_clearState` sweeps those up along with everything
    // else — already delivered its real answer, and a synthesized error reply
    // after a real ok one is two contradictory answers to one request.
    if (!callbackInfo.replySeen) {
      callbackInfo.callback(
        {
          header: { msg_type: "error", msg_id: requestId + "_error" },
          parent_header,
          content: { status: "error", ename, evalue, traceback: [] },
        },
        "iopub",
      );
      callbackInfo.callback(
        {
          header: { msg_type: replyType, msg_id: requestId + "_reply" },
          parent_header,
          // A real error reply carries the name and value alongside the status,
          // and a caller that resolves off the reply rather than the iopub error
          // — requestCommInfo does — has nowhere else to learn why.
          content: { status: "error", ename, evalue, traceback: [] },
        },
        "shell",
      );
    }
    if (!options.skipIdle && !callbackInfo.idleSeen) {
      callbackInfo.callback(
        {
          header: { msg_type: "status", msg_id: requestId + "_idle" },
          parent_header,
          content: { execution_state: "idle" },
        },
        "iopub",
      );
    }
    if (options.updateStatus !== false && !callbackInfo.suppressStatus) {
      this.setExecutionState("idle");
    }
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults, options = {}) {
    log("ZMQKernel.execute:", code);
    const requestId = `execute_${uuidv4()}`;

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
    const requestId = `complete_${uuidv4()}`;

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
    const requestId = `inspect_${uuidv4()}`;

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
      const requestId = `comm_info_${uuidv4()}`;
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
    const requestId = `${msgType}_${uuidv4()}`;
    const message = this._createMessage(msgType, requestId);
    message.content = content;
    message.metadata = metadata || {};
    message.buffers = toWireBuffers(buffers);
    this._sendShellMessage(message, requestId, NOOP, true, { expectsReply: false });
    return requestId;
  }

  async inputReply(input) {
    const requestId = `input_reply_${uuidv4()}`;

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
    if (this._destroyed) return;

    log("shell message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    const { msg_id } = message.parent_header;
    const callbackInfo = msg_id ? this.executionCallbacks[msg_id] : undefined;
    if (!callbackInfo) {
      return;
    }
    callbackInfo.lastProgressAt = Date.now();

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
    if (this._destroyed) return;

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
      callbackInfo.lastProgressAt = Date.now();
      callbackInfo.callback(message, "stdin");
    }
  }

  onIOMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed) return;

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

    const { msg_type } = message.header;
    const { msg_id } = message.parent_header;

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
        callbackInfo.lastProgressAt = Date.now();
        // Caught, not rethrown: the status bookkeeping below — idleSeen,
        // retirement, the watchdog's view of the kernel's state — must run
        // whatever a consumer does, and a plugin's middleware is on this
        // path. A throw that skipped it froze the state at busy with the
        // repair mechanisms gated on it ever reading idle again.
        try {
          callbackInfo.callback(message, "iopub");
        } catch (error) {
          log("ZMQKernel: iopub callback failed:", error);
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
      if (state === "idle") {
        this._reportedIdleSince = Date.now();
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
      if (!this._destroyed && !suppressStatus && this.lifecycle !== "restarting") {
        this.setExecutionState(state);
      }
    }
  }

  /**
   * A callback lives until the kernel has said everything it will say about
   * the request: the shell reply and the trailing iopub idle, in either order.
   * Retiring on one alone misroutes the other — a straggling idle would leave
   * the awaiting promise unresolved, a straggling reply would be dropped.
   *
   * A comm message has no reply to wait for, so its trailing idle retires it
   * on its own.
   *
   * When only one of the two has arrived, stamp when — the watchdog makes the
   * other one good after a grace period rather than leaving the entry, and
   * the caller, waiting forever on a dropped frame.
   */
  _retireExecution(msgId, callbackInfo) {
    const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
    const idleDone = callbackInfo.idleSeen || callbackInfo.expectsIdle === false;
    if (replyDone && idleDone) {
      delete this.executionCallbacks[msgId];
      return;
    }
    callbackInfo.halfSettledAt ??= Date.now();
  }

  /**
   * Stand in for a trailing idle the kernel published but we never saw. The
   * caller already has its reply, so this delivers the one message it is
   * still waiting on and nothing else: a synthesized error reply would be a
   * second answer to a request that was answered correctly.
   *
   * What waits on it is not cosmetic — a batch's promise resolves on reply
   * and idle together, and a watch execution holds every watch pane in the
   * window until its idle arrives.
   */
  _settleTrailingIdle(requestId, callbackInfo) {
    delete this.executionCallbacks[requestId];

    callbackInfo.callback(
      {
        header: { msg_type: "status", msg_id: `${requestId}_idle` },
        parent_header: { msg_id: requestId, msg_type: callbackInfo.requestType },
        content: { execution_state: "idle" },
      },
      "iopub",
    );
    if (!callbackInfo.suppressStatus) {
      this.setExecutionState("idle");
    }
  }

  destroy(forUnload = false) {
    log("ZMQKernel: destroy:", this);

    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;
    this._stopReadyProbe();
    this._stopAckWatchdog();

    // Clear pending state first to prevent errors during shutdown
    this._clearState("Kernel shut down");
    // Unlike a restart, nothing follows this connection, so the target claims
    // go with it.
    this._comms?.dispose();
    this._comms = null;

    // Close sockets first, while the peer still lives: the close is deferred
    // past any in-flight send, and an orderly zmq disconnect beats closing
    // into the RST storm of a killed process. After a graceful shutdown the
    // sockets are already gone — released while the kernel ran its atexit —
    // and this finds nothing left to do.
    this._releaseSockets(forUnload);

    // Kill the process
    try {
      this._kill();
    } catch (e) {
      log("ZMQKernel: Error killing process:", e.message);
    }

    // Clean up connection file (non-fatal if it fails)
    try {
      fs.unlinkSync(this.connectionFile);
    } catch (err) {
      log("ZMQKernel: Failed to delete connection file:", err.message);
    }

    super.destroy();
  }

  _createMessage(msgType, msgId = uuidv4()) {
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

// Extract the log level from an ipykernel stderr record formatted as
// "[AppName] LEVEL | message". Returns the uppercased level, or null if unprefixed.
function _ipythonLogLevel(text) {
  const match = text.match(/\]\s+(DEBUG|INFO|WARNING|ERROR|CRITICAL|FATAL)\s+\|/);
  return match ? match[1].toUpperCase() : null;
}

module.exports = ZMQKernel;
