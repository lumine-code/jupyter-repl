const fs = require("fs");
const { Disposable } = require("lumine");
const { v4: uuidv4 } = require("uuid");

const { launchSpec, killProcessTree } = require("./kernel-launcher");
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
  // Normal shell traffic is deliberately single-flight. ipykernel 7.0-7.3
  // can lose the read edge for a request that arrives while it sends the
  // previous reply; waiting for reply+idle before sending the next request
  // removes that race for traffic originating in this client.
  _shellQueue = [];
  _activeShellRequest = null;
  _shellDrainScheduled = false;
  // A connection generation owns one process, connection file, session and
  // socket set. Restart replaces the whole generation so no queued frame can
  // cross into the new process.
  _connectionGeneration = 0;
  _recovery = null;
  _recoveryClosePromise = Promise.resolve();
  _quarantinedRequestIds = new Set();
  _unresponsiveNotification = null;
  _restartPromise = null;
  _restartReadyResolve = null;
  _restartReadyReject = null;
  _fatalCleanupPromise = null;
  // Request ids of the readiness probes still outstanding, so their callback
  // entries can be reclaimed rather than left for the watchdog to puzzle over.
  _readyProbeIds = new Set();
  // Whether this kernel ever reached ready. The exit handler branches on it,
  // never on `store.startingKernels` — another launch can have an independent
  // marker even when both kernels use the same spec.
  _everReady = false;
  // Set by a graceful shutdown before it asks the kernel to go, so the exit
  // it provokes is not classified — or announced — as a crash.
  _expectingExit = false;
  // The one graceful shutdown this kernel will ever run. A second call must
  // join it, not race it: unlatched, the repeat failed instantly on the
  // already-released sockets and its caller's destroy SIGKILLed the kernel in
  // the middle of the very atexit the first request started.
  _shutdownPromise = null;
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
  // Which request the last status was parented to. When a repair finds the
  // report stuck at busy, this is what says whether the stuck word is the
  // repaired request's own — and safe to overwrite — or another cell's, which
  // must stand.
  _reportedStatusParent = null;

  constructor(kernelSpec, grammar, options, onStarted) {
    super(kernelSpec, grammar);
    this.startingKernelKey = options?.startingKernelKey || kernelSpec.display_name;
    this.options = { ...(options || {}) };
    delete this.options.startingKernelKey;
    options = this.options;
    // The transport owns connection-file cleanup so a generation replacement
    // can order socket close, process-tree termination and file removal.
    options.cleanupConnectionFile = false;

    this._launchInitialGeneration()
      .then(async ({ config, connectionFile, spawn }) => {
        if (this._destroyed) {
          try {
            await this._killProcessTree(spawn);
          } catch (error) {
            this.kernelProcess = spawn;
            this.connectionFile = connectionFile;
            throw new Error(`Abandoned kernel process could not be terminated: ${error.message}`, {
              cause: error,
            });
          }
          try {
            fs.unlinkSync(connectionFile);
          } catch {
            // The abandoned initial generation never becomes visible.
          }
          return;
        }
        this._connectionGeneration++;
        this.connection = config;
        this.connectionFile = connectionFile;
        this.kernelProcess = spawn;
        this.monitorNotifications(spawn);
        this.connect(() => {
          try {
            this._executeStartupCode();
            if (onStarted) {
              onStarted(this);
            }
          } catch (error) {
            log("ZMQKernel: startup callback failed:", error);
            lumine.notifications.addError(`${this.displayName}: kernel startup failed`, {
              detail: error.message,
              dismissable: true,
            });
            this._terminateFailedStartup();
          }
        });
      })
      .catch(async (error) => {
        const failedProcess = this.kernelProcess;
        const failedConnectionFile = this.connectionFile;
        this.kernelProcess = null;
        await this._releaseSockets(false, true);
        let terminationError = null;
        try {
          await this._killProcessTree(failedProcess);
        } catch (killError) {
          terminationError = killError;
          this.kernelProcess = failedProcess;
        }
        if (failedConnectionFile && !terminationError) {
          try {
            fs.unlinkSync(failedConnectionFile);
          } catch {
            // Already removed is the desired state.
          }
          this.connectionFile = null;
        }
        const store = require("./store");
        store.startingKernels.delete(this.startingKernelKey || this.kernelSpec.display_name);
        if (terminationError) {
          this.setLifecycle("unresponsive");
          this.setExecutionState("unresponsive");
        }
        if (this._destroyed && !terminationError) return;
        log("ZMQKernel: Failed to launch kernel:", error);
        lumine.notifications.addError(`Failed to start kernel: ${this.kernelSpec.display_name}`, {
          detail: terminationError
            ? `${error.message}\nThe failed process tree is still alive: ${terminationError.message}`
            : error.message,
          dismissable: true,
        });
      });
  }

  _launchInitialGeneration() {
    return launchSpec(this.kernelSpec, this.options);
  }

  _ensureRequestState() {
    this.executionCallbacks ||= {};
    this._shellQueue ||= [];
    this._quarantinedRequestIds ||= new Set();
    this._connectionGeneration ??= 0;
  }

  _resolveRestartReady() {
    const resolve = this._restartReadyResolve;
    this._restartReadyResolve = null;
    this._restartReadyReject = null;
    resolve?.();
  }

  _rejectRestartReady(error) {
    const reject = this._restartReadyReject;
    this._restartReadyResolve = null;
    this._restartReadyReject = null;
    reject?.(error instanceof Error ? error : new Error(String(error)));
  }

  connect(done) {
    const generation = this._connectionGeneration;
    const scheme = this.connection.signature_scheme.slice("hmac-".length);
    const { key } = this.connection;
    this.shellSocket = new Socket("dealer", scheme, key);
    this.stdinSocket = new Socket("dealer", scheme, key);
    this.ioSocket = new Socket("sub", scheme, key);
    const id = uuidv4();
    this.shellSocket.identity = `dealer${id}`;
    this.stdinSocket.identity = `dealer${id}`;
    // this.ioSocket.identity = `sub${id}`
    this.shellSocket.on("message", (message) => {
      if (generation === this._connectionGeneration) this.onShellMessage(message);
    });
    this.ioSocket.on("message", (message) => {
      if (generation === this._connectionGeneration) this.onIOMessage(message);
    });
    this.stdinSocket.on("message", (message) => {
      if (generation === this._connectionGeneration) this.onStdinMessage(message);
    });
    for (const [name, socket] of [
      ["shell", this.shellSocket],
      ["iopub", this.ioSocket],
      ["stdin", this.stdinSocket],
    ]) {
      socket.on("error", (error) => this._handleSocketError(name, error, generation));
    }
    const address = `${this.connection.transport}://${this.connection.ip}:`;
    this.ioSocket.subscribe("");
    this.shellSocket.connect(address + this.connection.shell_port);
    this.ioSocket.connect(address + this.connection.iopub_port);
    this.stdinSocket.connect(address + this.connection.stdin_port);

    this.monitor(done);
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
    if (this._fatalCleanupPromise) return this._fatalCleanupPromise;
    this._expectingExit = true;
    this._fatalCleanupPromise = Promise.all([
      this._clearRecovery(),
      this._releaseSockets(false, true),
    ])
      .then(() => this._kill())
      .then(() => {
        if (this.connectionFile) {
          try {
            fs.unlinkSync(this.connectionFile);
          } catch {
            // Already removed is the desired state.
          }
          this.connectionFile = null;
        }
        const store = require("./store");
        store.startingKernels.delete(this.startingKernelKey || this.kernelSpec.display_name);
      })
      .catch((error) => {
        this.setLifecycle("unresponsive");
        this.setExecutionState("unresponsive");
        log("ZMQKernel: startup cleanup failed:", error);
      });
    return this._fatalCleanupPromise;
  }

  monitorNotifications(childProcess) {
    childProcess.on("error", (error) => {
      if (this.kernelProcess !== childProcess || this._destroyed) return;
      log("ZMQKernel: process error:", error);
      this.kernelProcess = null;
      this._stopReadyProbe();
      this._stopAckWatchdog();
      this._rejectRestartReady(error);
      this.setLifecycle("dead");
      this.setExecutionState("dead");
      this.emitDidLoseKernel(error.message || "Kernel process failed");
      this._clearState(error.message || "Kernel process failed");
      this._releaseSockets(false, true);
      if (!this._everReady) {
        const store = require("./store");
        store.startingKernels.delete(this.startingKernelKey || this.kernelSpec.display_name);
      }
      if (this.connectionFile) {
        try {
          fs.unlinkSync(this.connectionFile);
        } catch {
          // Already removed is the desired state.
        }
        this.connectionFile = null;
      }
      lumine.notifications.addError(`${this.displayName}: kernel process failed`, {
        detail: error.message,
        dismissable: true,
      });
    });
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
      // and every branch below acts on the *current* one. Which child died is
      // the question; `lifecycle` was only ever a proxy for it, and the proxy
      // is wrong once the new process has reached ready.
      if (this.kernelProcess !== childProcess) {
        log("ZMQKernel: ignoring the exit of a process already replaced");
        return;
      }
      // Destroy already stopped the timers, closed the sockets and settled
      // everything; the process it killed has nothing left to report.
      if (this._destroyed) {
        return;
      }
      // Past the identity guard, this is the current process — whichever
      // phase it died in, its probe and watchdog have nothing to attend.
      this._stopReadyProbe();
      this._stopAckWatchdog();
      const store = require("./store");

      if (this._expectingExit) {
        // The exit we asked for — a graceful shutdown, or the probe giving up
        // on a mute kernel. Settle quietly: whatever the code says, this is
        // not a crash, and it was already announced if it deserved to be.
        // The lose event still fires, so a cell running at shutdown time is
        // settled by it rather than left spinning.
        //
        // Consumed, not just read: the flag describes one exit. Left set, a
        // restart after an exhaustion-killed kernel carried it into the new
        // process, and every later death — including a genuine crash — was
        // settled as a quiet shutdown.
        if (this.lifecycle === "restarting") {
          this._rejectRestartReady(new Error("Kernel exited before restart became ready"));
        }
        this._expectingExit = false;
        this.setLifecycle("dead");
        this.setExecutionState("dead");
        this.emitDidLoseKernel("Kernel shut down");
        this._clearState("Kernel shut down");
        // A kernel that never became ready was never registered, so no
        // destroy is coming to release what it holds.
        if (!this._everReady) {
          this._releaseSockets(false);
          if (this.connectionFile) {
            try {
              fs.unlinkSync(this.connectionFile);
            } catch (e) {
              // Already gone is fine.
            }
            this.connectionFile = null;
          }
        }
        return;
      }

      if (this.lifecycle === "restarting") {
        // Only the new process can reach here — the identity guard filters
        // the one the restart killed — so the restart's own spawn died before
        // becoming ready. Left unhandled, the probe exhausts in silence and
        // `_socketRestart`'s reentry guard swallows every further restart:
        // the kernel wedges in "restarting" for the life of the window.
        this._discardReadyProbes();
        this._cancelReadiness?.();
        this._rejectRestartReady(new Error("Kernel process died during restart"));
        this.setLifecycle("dead");
        // The bar too: `_socketRestart` set it to "restarting", and with no
        // destroy coming, nothing else would ever move it again.
        this.setExecutionState("dead");
        this.emitDidLoseKernel("Kernel process died during restart");
        lumine.notifications.addError(`${this.kernelSpec.display_name}: restart failed`, {
          description:
            "The new kernel process died before it became ready. Restart again to retry.",
          detail: `Exit code ${code}${signal ? `, signal ${signal}` : ""}`,
          dismissable: true,
        });
        this._clearState("Kernel process died during restart");
        return;
      }

      if (!this._everReady) {
        // Died during its own first startup. Judged by this kernel's flag,
        // never by `store.startingKernels`: another launch can own a separate
        // marker even when both kernels use the same spec.
        store.startingKernels.delete(this.startingKernelKey || this.kernelSpec.display_name);
        if (code !== 0) {
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
        return;
      }

      // The kernel process is gone after startup — died on a native crash,
      // was killed from outside, or exited cleanly under a running cell.
      // Either way no reply will ever arrive: settle the outstanding
      // executions first, while their callbacks still exist.
      this.setLifecycle("dead");
      // A crash mid-cell otherwise leaves the bar at "busy" for good.
      this.setExecutionState("dead");
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

      // Reachable from outside the round too: a failed restart never runs
      // finish(), and its listeners — one riding `message` per socket —
      // otherwise accrue until destroy.
      this._cancelReadiness?.();
      const cancelReadiness = () => {
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
        if (finished) {
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
      const requestId = `ready_probe_${this._readyGeneration ?? 0}_${uuidv4()}`;
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
      const store = require("./store");
      store.startingKernels.delete(this.startingKernelKey || this.kernelSpec.display_name);
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
    log("ZMQKernel: sending SIGKILL");
    return this._killProcessTree(this.kernelProcess);
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
    if (this._shutdownPromise) return this._shutdownPromise;
    let resolveShutdown;
    let rejectShutdown;
    const shutdown = new Promise((resolve, reject) => {
      resolveShutdown = resolve;
      rejectShutdown = reject;
    });
    // Publish the latch before entering the async body. Its synchronous prefix
    // marks the exit expected and may settle callbacks reentrantly.
    this._shutdownPromise = shutdown;
    Promise.resolve(this._socketShutdown()).then(resolveShutdown, rejectShutdown);
    return shutdown;
  }

  restart(onRestarted) {
    return this._socketRestart(onRestarted);
  }

  /** How long a kernel gets to exit on its own before `destroy` kills it. */
  static SHUTDOWN_TIMEOUT_MS = 2000;

  async _socketShutdown() {
    this._rejectRestartReady(new Error("Kernel is shutting down"));
    if (!this.shellSocket) {
      return;
    }
    if (this.lifecycle === "recovering" || this.lifecycle === "unresponsive") {
      if (this.lifecycle === "recovering" && this._activeShellRequest) {
        this._quarantine(
          this._activeShellRequest,
          "The kernel was shut down before the uncertain request was acknowledged.",
        );
      }
      this._expectingExit = true;
      const child = this.kernelProcess;
      await Promise.all([this._clearRecovery(), this._releaseSockets(false, true)]);
      await this._killProcessTree(child);
      return;
    }
    // Before the send, so however fast the kernel exits, the exit handler
    // already knows it was asked for.
    this._expectingExit = true;
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
    await this._releaseSockets(false);

    await this._awaitProcessExit(ZMQKernel.SHUTDOWN_TIMEOUT_MS);
  }

  /**
   * Detach and close all three sockets, exactly once. The refs are nulled so
   * a later teardown — `destroy` after a graceful shutdown — finds nothing
   * left to close.
   */
  async _releaseSockets(forUnload, discardPending = false) {
    const closes = [];
    for (const name of ["shellSocket", "ioSocket", "stdinSocket"]) {
      const socket = this[name];
      if (!socket) {
        continue;
      }
      this[name] = null;
      try {
        // Listeners first, so nothing fires into a closing socket.
        socket.removeAllListeners();
        closes.push(Promise.resolve(socket.close(forUnload, discardPending)));
      } catch (e) {
        log(`ZMQKernel: Error closing ${name}:`, e.message);
      }
    }
    await Promise.all(closes);
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
  _clearState(reason = "Kernel state cleared", forUnload = false, invalidate = false) {
    this._ensureRequestState();
    // Taken whole and replaced before anything is notified, so a callback that
    // arms a fresh request keeps it — the same shape `Kernel#abortInFlight`
    // uses, and the reason `_settlePending` exists apart from the lookup in
    // `_settleUnanswered`.
    const pending = Object.entries(this.executionCallbacks);
    this.executionCallbacks = {};
    this._shellQueue = [];
    this._activeShellRequest = null;
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
    // window. The MCP inspect tool waits on one of those.
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
    if (this._restartPromise) {
      if (onRestarted) this._restartPromise.then((restarted) => restarted && onRestarted());
      return this._restartPromise;
    }
    // A kernel already asked to go is going; its sockets are released and a
    // destroy is on its way. Restarting it would spawn a process against
    // sockets that no longer exist.
    if (this._shutdownPromise) {
      log("ZMQKernel: restart refused, shutdown already in progress");
      lumine.notifications.addWarning(
        `${this.kernelSpec.display_name}: restart ignored, the kernel is shutting down`,
        { dismissable: true },
      );
      return Promise.resolve(false);
    }
    if (this.lifecycle === "loading") {
      log("ZMQKernel: restart ignored while the first generation is still loading");
      return Promise.resolve(false);
    }
    // Defer the body one microtask so the latch exists before clearing state;
    // a callback settled by that clear is allowed to call restart again.
    const restarting = Promise.resolve()
      .then(() => this._replaceConnectionGeneration())
      .catch((error) => {
        log("ZMQKernel: restart error:", error);
        return false;
      });
    this._restartPromise = restarting;
    const clear = () => {
      if (this._restartPromise === restarting) this._restartPromise = null;
    };
    restarting.then(clear, clear);
    if (onRestarted) restarting.then((restarted) => restarted && onRestarted());
    return restarting;
  }

  async _replaceConnectionGeneration() {
    if (this._destroyed || this._shutdownPromise) return false;
    this._expectingExit = false;
    this.setLifecycle("restarting");
    this.setExecutionState("restarting");
    this._unresponsiveNotification?.dismiss?.();
    this._unresponsiveNotification = null;
    const recoveryClosed = this._clearState("Kernel restarted", false, true);

    const oldProcess = this.kernelProcess;
    const oldConnectionFile = this.connectionFile;
    // Make the old process's exit handler stale before terminating it.
    this.kernelProcess = null;
    await Promise.all([recoveryClosed, this._releaseSockets(false, true)]);
    try {
      await this._killProcessTree(oldProcess);
    } catch (error) {
      this.kernelProcess = oldProcess;
      this.setLifecycle("unresponsive");
      this.setExecutionState("unresponsive");
      this._showUnresponsiveNotification(
        `The old kernel process tree could not be terminated: ${error.message}`,
        false,
      );
      throw error;
    }
    if (oldConnectionFile) {
      try {
        fs.unlinkSync(oldConnectionFile);
      } catch {
        // Already removed is the desired state.
      }
    }
    this.connectionFile = null;
    if (this._destroyed || this._shutdownPromise) return false;

    try {
      const { config, connectionFile, spawn } = await this._launchFreshGeneration();
      if (this._destroyed || this._shutdownPromise) {
        try {
          await this._killProcessTree(spawn);
        } catch (error) {
          // Keep the failed child reachable so the common cleanup path can
          // retry and, if necessary, report the fatal teardown failure.
          this.kernelProcess = spawn;
          this.connectionFile = connectionFile;
          throw error;
        }
        try {
          fs.unlinkSync(connectionFile);
        } catch {
          // The aborted generation never becomes visible.
        }
        return false;
      }
      this._connectionGeneration++;
      this.sessionId = uuidv4();
      this.connection = config;
      this.connectionFile = connectionFile;
      this.kernelProcess = spawn;
      this.monitorNotifications(spawn);
      await new Promise((resolve, reject) => {
        this._restartReadyResolve = resolve;
        this._restartReadyReject = reject;
        this.connect(() => {
          try {
            if (this._destroyed || this._shutdownPromise) {
              this._rejectRestartReady(new Error("Kernel restart was cancelled"));
              return;
            }
            this._executeStartupCode();
            this._resolveRestartReady();
          } catch (error) {
            this._rejectRestartReady(error);
          }
        });
      });
      if (this._destroyed || this._shutdownPromise) return false;
      return true;
    } catch (error) {
      this._rejectRestartReady(error);
      const failedProcess = this.kernelProcess;
      const failedConnectionFile = this.connectionFile;
      this.kernelProcess = null;
      await this._releaseSockets(false, true);
      try {
        await this._killProcessTree(failedProcess);
      } catch (killError) {
        this.kernelProcess = failedProcess;
        this.setLifecycle("unresponsive");
        this.setExecutionState("unresponsive");
        this._showUnresponsiveNotification(
          `The failed kernel process tree could not be terminated: ${killError.message}`,
          false,
        );
        throw killError;
      }
      if (failedConnectionFile) {
        try {
          fs.unlinkSync(failedConnectionFile);
        } catch {
          // Already removed is the desired state.
        }
      }
      this.connectionFile = null;
      if (this._destroyed || this._shutdownPromise) return false;
      const alreadyDead = this.lifecycle === "dead";
      this.setLifecycle("dead");
      this.setExecutionState("dead");
      if (!alreadyDead) {
        lumine.notifications.addError(`${this.displayName}: restart failed`, {
          detail: error.message,
          dismissable: true,
        });
      }
      throw error;
    }
  }

  _launchFreshGeneration() {
    return launchSpec(this.kernelSpec, this.options);
  }

  _killProcessTree(childProcess) {
    return killProcessTree(childProcess);
  }

  /** Queue one ordinary shell request. Only the active record reaches ZMQ. */
  _sendShellMessage(message, requestId, onResults, suppressStatus = false, options = {}) {
    this._ensureRequestState();
    const requestType = message.header.msg_type;
    const entry = {
      callback: onResults,
      message,
      suppressStatus,
      requestType,
      expectsReply: options.expectsReply !== false,
      expectsIdle: options.expectsIdle !== false,
      replySeen: false,
      idleSeen: false,
      acknowledged: false,
      halfSettledAt: null,
      lastProgressAt: null,
      armedAt: Date.now(),
      sentAt: null,
      idleSince: null,
      queued: true,
      generation: this._connectionGeneration,
    };
    this.executionCallbacks[requestId] = entry;

    if (!this.shellSocket) {
      this._settleUnanswered(requestId, requestType, "KernelGone", "The kernel is shutting down.");
      return requestId;
    }
    if (this.lifecycle === "recovering" || this.lifecycle === "unresponsive") {
      this._settleUnanswered(
        requestId,
        requestType,
        "KernelUnresponsive",
        this.lifecycle === "recovering"
          ? "The kernel connection is being recovered; this request was not sent."
          : "The kernel connection is quarantined. Restart the kernel before continuing.",
        { updateStatus: false },
      );
      return requestId;
    }
    if (this.lifecycle !== "ready") {
      this._settleUnanswered(
        requestId,
        requestType,
        "ExecutionCancelled",
        `The kernel is ${this.lifecycle}; this request was not sent.`,
        { updateStatus: false },
      );
      return requestId;
    }

    // Completion and inspection answers are useful only for the newest cursor
    // state. Supersede queued copies before they can become stale on the wire.
    if (requestType === "complete_request" || requestType === "inspect_request") {
      this._cancelQueuedRequests(
        (queued) => queued.requestType === requestType,
        "ExecutionCancelled",
        "A newer introspection request superseded this one before it was sent.",
      );
    } else if (requestType === "execute_request" && !suppressStatus) {
      // A user run outranks stale editor assistance. The active introspection
      // is allowed to finish; every queued one is known not to have run.
      this._cancelQueuedRequests(
        (queued) =>
          queued.requestType === "complete_request" || queued.requestType === "inspect_request",
        "ExecutionCancelled",
        "The pending introspection request was cancelled by code execution.",
      );
      if (this.executionState !== "busy") this.setExecutionState("queued");
    }

    this._shellQueue.push(requestId);
    this._drainShellQueue();
    return requestId;
  }

  /** Startup probes precede the ordinary ready-state queue. */
  _sendDirectShellMessage(message, requestId, onResults, suppressStatus = false, options = {}) {
    this._ensureRequestState();
    const now = Date.now();
    const entry = {
      callback: onResults,
      message,
      suppressStatus,
      requestType: message.header.msg_type,
      expectsReply: options.expectsReply !== false,
      expectsIdle: options.expectsIdle !== false,
      replySeen: false,
      idleSeen: false,
      acknowledged: false,
      halfSettledAt: null,
      lastProgressAt: now,
      armedAt: now,
      sentAt: now,
      idleSince: this._reportedExecutionState === "idle" ? now : null,
      queued: false,
      direct: true,
      generation: this._connectionGeneration,
    };
    this.executionCallbacks[requestId] = entry;
    const generation = this._connectionGeneration;
    this.shellSocket
      ?.send(
        new Message(message),
        () => generation !== this._connectionGeneration || !this.executionCallbacks[requestId],
      )
      .catch((error) => {
        if (generation !== this._connectionGeneration) return;
        this._settleUnanswered(
          requestId,
          entry.requestType,
          "SendError",
          error.message || "Failed to send message to kernel",
          { updateStatus: false },
        );
      });
    return requestId;
  }

  _cancelQueuedRequests(predicate, ename, evalue) {
    this._ensureRequestState();
    const queued = this._shellQueue;
    // Replace before callbacks run so a reentrant request is appended to the
    // live queue rather than overwritten when this sweep finishes.
    this._shellQueue = [];
    for (const requestId of queued) {
      const entry = this.executionCallbacks[requestId];
      if (!entry || !predicate(entry)) {
        if (entry) this._shellQueue.push(requestId);
        continue;
      }
      delete this.executionCallbacks[requestId];
      this._settlePending(requestId, entry, ename, evalue, { updateStatus: false });
    }
  }

  _drainShellQueue() {
    this._ensureRequestState();
    if (
      this._destroyed ||
      this._activeShellRequest ||
      this.lifecycle !== "ready" ||
      !this.shellSocket
    ) {
      return;
    }
    let requestId = null;
    let entry = null;
    while (this._shellQueue.length > 0 && !entry) {
      requestId = this._shellQueue.shift();
      entry = this.executionCallbacks[requestId];
    }
    if (!entry) return;

    entry.queued = false;
    entry.sentAt = Date.now();
    entry.lastProgressAt = entry.sentAt;
    entry.idleSince = this._reportedExecutionState === "idle" ? entry.sentAt : null;
    entry.generation = this._connectionGeneration;
    this._activeShellRequest = requestId;
    if (
      entry.requestType === "execute_request" &&
      !entry.suppressStatus &&
      this.executionState !== "busy" &&
      this.executionState !== "queued"
    ) {
      this.setExecutionState("queued");
    }
    const generation = this._connectionGeneration;
    this.shellSocket
      .send(
        new Message(entry.message),
        () =>
          generation !== this._connectionGeneration ||
          this._activeShellRequest !== requestId ||
          !this.executionCallbacks[requestId],
      )
      .catch((error) => {
        if (generation !== this._connectionGeneration) return;
        log("ZMQKernel: Error sending shell message:", error);
        this._settleUnanswered(
          requestId,
          entry.requestType,
          "SendError",
          error.message || "Failed to send message to kernel",
        );
      });
  }

  _scheduleShellDrain() {
    this._ensureRequestState();
    if (this._shellDrainScheduled) return;
    this._shellDrainScheduled = true;
    queueMicrotask(() => {
      this._shellDrainScheduled = false;
      this._drainShellQueue();
    });
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
    const probeSession = uuidv4();
    const probeId = `recovery_probe_${this._connectionGeneration}_${uuidv4()}`;
    socket.identity = `recovery${uuidv4()}`;
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
      probe.closedPromise = Promise.resolve(probe.socket.close(false, true)).then(() => {
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
          return Promise.resolve(probe.socket.close(forUnload, true));
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
    this._ensureRequestState();
    const callbackInfo = this.executionCallbacks[requestId];
    if (!callbackInfo) {
      return;
    }
    delete this.executionCallbacks[requestId];
    this._shellQueue = this._shellQueue.filter((queuedId) => queuedId !== requestId);
    if (this._activeShellRequest === requestId) this._activeShellRequest = null;
    this._settlePending(requestId, callbackInfo, ename, evalue, {
      requestType,
      ...options,
    });
    this._maybeFinishRecovery();
    this._scheduleShellDrain();
  }

  _finishShellRequest(requestId, callbackInfo) {
    this._ensureRequestState();
    if (this.executionCallbacks[requestId] !== callbackInfo) return;
    delete this.executionCallbacks[requestId];
    if (this._activeShellRequest === requestId) this._activeShellRequest = null;
    this._maybeFinishRecovery();
    this._scheduleShellDrain();
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
    const deliver = (message, channel) => {
      try {
        callbackInfo.callback(message, channel);
      } catch (error) {
        console.error("jupyter-repl: settlement callback failed:", error);
      }
    };
    // Only the halves that never arrived are made good. A half-settled entry
    // reaching here — `_clearState` sweeps those up along with everything
    // else — already delivered its real answer, and a synthesized error reply
    // after a real ok one is two contradictory answers to one request.
    if (!callbackInfo.replySeen) {
      deliver(
        {
          header: { msg_type: "error", msg_id: requestId + "_error" },
          parent_header,
          content: { status: "error", ename, evalue, traceback: [] },
        },
        "iopub",
      );
      deliver(
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
    if (!options.skipIdle && !callbackInfo.idleSeen && callbackInfo.expectsIdle !== false) {
      deliver(
        {
          header: { msg_type: "status", msg_id: requestId + "_idle" },
          parent_header,
          content: { execution_state: "idle" },
        },
        "iopub",
      );
    }
    // Never over a busy kernel: with the repair rules ungated from the global
    // report, this can now run while another cell genuinely executes, and
    // forcing the bar to idle there would also swallow that cell's own
    // completion — its real idle then changes nothing.
    if (
      options.updateStatus !== false &&
      !callbackInfo.suppressStatus &&
      this._reportedExecutionState === "idle"
    ) {
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
      this._finishShellRequest(msgId, callbackInfo);
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
    callbackInfo.callback(
      {
        header: { msg_type: "status", msg_id: `${requestId}_idle` },
        parent_header: { msg_id: requestId, msg_type: callbackInfo.requestType },
        content: { execution_state: "idle" },
      },
      "iopub",
    );
    // When the kernel's last word was this request's own busy, the stuck
    // report IS the lost frame being repaired — the kernel has demonstrably
    // finished, so the watchdog's view is corrected along with the caller's.
    // Another request's busy stands: that cell really is running.
    if (this._reportedStatusParent === requestId && this._reportedExecutionState !== "idle") {
      this._reportedExecutionState = "idle";
      this._reportedIdleSince = Date.now();
    }
    if (!callbackInfo.suppressStatus && this._reportedExecutionState === "idle") {
      this.setExecutionState("idle");
    }
    this._finishShellRequest(requestId, callbackInfo);
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

    // Close sockets first, while the peer still lives: the close is deferred
    // past any in-flight send, and an orderly zmq disconnect beats closing
    // into the RST storm of a killed process. After a graceful shutdown the
    // sockets are already gone — released while the kernel ran its atexit —
    // and this finds nothing left to do.
    const child = this.kernelProcess;
    this.kernelProcess = null;
    const socketsClosed = this._releaseSockets(forUnload, discardPending);
    const kill = () =>
      this._killProcessTree(child).catch((error) =>
        log("ZMQKernel: Error killing process:", error.message),
      );
    if (forUnload) {
      // Both close paths are synchronous for unload; do not depend on a later
      // microtask while the renderer is being torn down.
      kill();
    } else {
      Promise.all([recoveryClosed, socketsClosed]).then(kill);
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
