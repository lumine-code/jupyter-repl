const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { launchSpec, killProcessTree } = require("./kernel-launcher");
const { Message, Socket } = require("./jmp");
const { log } = require("./utils");
const ProcessDiagnostics = require("./process-diagnostics");

/**
 * Own the resources of a local kernel connection across process generations.
 * Requests and recovery policy stay with the transport; no retired process or
 * socket is reused by the replacement generation.
 */
class ZMQConnectionGeneration {
  epoch = 0;
  sessionId = randomUUID();
  config;
  connectionFile;
  kernelProcess;
  sockets = { shellSocket: undefined, ioSocket: undefined, stdinSocket: undefined };
  options;
  everReady = false;
  expectingExit = false;
  initialPromise = null;
  shutdownPromise = null;
  restartPromise = null;
  initialization = null;
  connectionPromise = null;
  teardownPromise = null;
  processListeners = new Map();
  retiringSockets = new Map();
  retiringProcesses = new Map();
  _unloadSubscription = null;
  _unloading = false;

  constructor(transport) {
    this.transport = transport;
  }

  start(options, onStarted) {
    if (this.initialPromise) return this.initialPromise;
    this.options = { ...(options || {}) };
    delete this.options.startingKernelKey;
    // This owner handles connection-file cleanup so a generation replacement
    // can order socket close, process-tree termination and file removal.
    this.options.cleanupConnectionFile = false;

    this.initialPromise = this.transport
      ._launchInitialGeneration()
      .then(async ({ config, connectionFile, spawn }) => {
        if (this.transport._destroyed) {
          const retirement = this._retireProcess(spawn);
          try {
            await this._killRetiredProcess(retirement);
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
        this.adopt({ config, connectionFile, spawn });
        await this.initialize(spawn, false);
        if (!this.transport._destroyed && !this.shutdownPromise) onStarted?.(this.transport);
      })
      .catch(async (error) => {
        const failedProcess = this.kernelProcess;
        const failedConnectionFile = this.connectionFile;
        const failedListeners = this.detachProcess(failedProcess);
        const retirement = this._retireProcess(failedProcess);
        this.kernelProcess = null;
        await this.transport._releaseSockets(false, true);
        let terminationError = null;
        try {
          await this._killRetiredProcess(retirement);
        } catch (killError) {
          terminationError = killError;
          this.kernelProcess = failedProcess;
          this.restoreProcess(failedProcess, failedListeners);
        }
        if (failedConnectionFile && !terminationError) {
          try {
            fs.unlinkSync(failedConnectionFile);
          } catch {
            // Already removed is the desired state.
          }
          this.connectionFile = null;
        }
        this.transport._clearStartingMarker();
        if (terminationError) {
          this.transport.setLifecycle("unresponsive");
          this.transport.setExecutionState("unresponsive");
        } else {
          this.transport.setLifecycle("dead");
          this.transport.setExecutionState("dead");
        }
        if (this.transport._destroyed && !terminationError) return;
        log("ZMQKernel: Failed to launch kernel:", error);
        lumine.notifications.addError("Failed to start kernel", {
          detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${
            terminationError
              ? `${error.message}\nThe failed process tree is still alive: ${terminationError.message}`
              : error.message
          }`,
          dismissable: true,
        });
      });

    return this.initialPromise;
  }

  launchInitial() {
    return launchSpec(this.transport.kernelSpec, this.options);
  }

  async initialize(child, restarting) {
    const controller = new AbortController();
    const { signal } = controller;
    const { promise, resolve, reject } = Promise.withResolvers();
    const fail = (error) => {
      controller.abort(error);
      reject(error);
    };
    let startupDeadline;
    this.initialization = fail;
    try {
      this.transport.monitorNotifications(child);
      this.transport.connect(() => {
        if (signal.aborted) return;
        startupDeadline = setTimeout(
          () => fail(new Error("Timed out waiting for the kernel startup code to finish.")),
          this.transport.constructor.STARTUP_TIMEOUT_MS,
        );
        Promise.resolve()
          .then(() => this.transport._executeStartupCode(signal))
          .then(resolve, fail);
      });
      await promise;
      signal.throwIfAborted();
      if (!this.transport._publishReady(restarting)) {
        throw new Error("Kernel initialization was cancelled");
      }
    } finally {
      this.initialization = null;
      this.transport._cancelReadiness?.();
      clearTimeout(startupDeadline);
    }
  }

  rejectInitialization(error) {
    if (!this.initialization) return false;
    this.initialization(error);
    return true;
  }

  connect(done) {
    const generation = this.epoch;
    const scheme = this.config.signature_scheme.slice("hmac-".length);
    const { key } = this.config;
    this.sockets.shellSocket = new Socket("dealer", scheme, key);
    this.sockets.stdinSocket = new Socket("dealer", scheme, key, { immediate: true });
    this.sockets.ioSocket = new Socket("sub", scheme, key);
    const { shellSocket, ioSocket, stdinSocket } = this.sockets;
    const id = randomUUID();
    shellSocket.identity = `dealer${id}`;
    stdinSocket.identity = `dealer${id}`;
    for (const [slot, name, onMessage] of [
      ["shellSocket", "shell", "onShellMessage"],
      ["ioSocket", "iopub", "onIOMessage"],
      ["stdinSocket", "stdin", "onStdinMessage"],
    ]) {
      const socket = this.sockets[slot];
      const isCurrent = () => generation === this.epoch && this.sockets[slot] === socket;
      socket.on("message", (message) => {
        if (isCurrent()) this.transport[onMessage](message);
      });
      socket.on("error", (error) => {
        if (isCurrent()) this.transport._handleSocketError(name, error, generation);
      });
    }
    const address = `${this.config.transport}://${this.config.ip}:`;
    ioSocket.subscribe("");
    shellSocket.connect(address + this.config.shell_port);
    ioSocket.connect(address + this.config.iopub_port);
    stdinSocket.connect(address + this.config.stdin_port);

    this.transport.monitor(done);
  }

  monitorProcess(childProcess) {
    this.detachProcess(childProcess);
    const listeners = [];
    this.processListeners.set(childProcess, listeners);
    const diagnostics = new ProcessDiagnostics(({ text, level }) => {
      if (this.kernelProcess !== childProcess || this.transport._destroyed) return;
      // This advisory describes our expected local transport, rather than a
      // failed launch. Keep the complete diagnostic instead of discarding pipe
      // fragments or presenting them as unrelated errors.
      if (
        level === "WARNING" &&
        this.config?.transport === "tcp" &&
        ["127.0.0.1", "localhost", "::1"].includes(this.config.ip) &&
        /running over TCP without encryption/i.test(text)
      ) {
        log("ZMQKernel: process warning:", text);
        return;
      }
      switch (level) {
        case "WARNING":
          lumine.notifications.addWarning("Kernel warning", {
            detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${text}`,
            dismissable: true,
          });
          break;
        case "INFO":
        case "DEBUG":
          log("ZMQKernel: stderr:", text);
          break;
        default:
          lumine.notifications.addError("Kernel error", {
            detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${text}`,
            dismissable: true,
          });
      }
    });
    const processDetail = (summary) => {
      const tail = diagnostics.getTail().trim();
      return tail ? `${summary}\n\nKernel process diagnostics:\n${tail}` : summary;
    };
    const listen = (emitter, event, callback) => {
      emitter.on(event, callback);
      listeners.push({ emitter, event, callback });
    };
    listen(childProcess, "error", (error) => {
      if (this.kernelProcess !== childProcess || this.transport._destroyed) return;
      if (this.rejectInitialization(new Error(processDetail(error.message), { cause: error }))) {
        return;
      }
      this.detachProcess(childProcess);
      log("ZMQKernel: process error:", error);
      this.kernelProcess = null;
      this.transport._stopReadyProbe();
      this.transport._stopAckWatchdog();
      this.transport.setLifecycle("dead");
      this.transport.setExecutionState("dead");
      this.transport.emitDidLoseKernel(error.message || "Kernel process failed");
      this.transport._clearState(error.message || "Kernel process failed");
      this.transport._releaseSockets(false, true);
      if (!this.everReady) {
        this.transport._clearStartingMarker();
      }
      if (this.connectionFile) {
        try {
          fs.unlinkSync(this.connectionFile);
        } catch {
          // Already removed is the desired state.
        }
        this.connectionFile = null;
      }
      lumine.notifications.addError("Kernel process failed", {
        detail: `Kernel: ${this.transport.displayName}\n\n${processDetail(error.message)}`,
        dismissable: true,
      });
    });
    listen(childProcess.stdout, "data", (data) => {
      if (this.kernelProcess !== childProcess || this.transport._destroyed) return;
      data = data.toString();

      if (lumine.config.get("jupyter-repl.kernelNotifications")) {
        lumine.notifications.addInfo("Kernel output", {
          detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${data}`,
          dismissable: true,
        });
      } else {
        log("ZMQKernel: stdout:", data);
      }
    });
    listen(childProcess.stderr, "data", (data) => {
      if (this.kernelProcess !== childProcess || this.transport._destroyed) return;
      diagnostics.write(data);
    });
    listen(childProcess.stderr, "end", () => diagnostics.end());
    listen(childProcess.stderr, "close", () => diagnostics.end());
    // Monitor process exit to clean up state if kernel crashes during startup
    listen(childProcess, "exit", (code, signal) => {
      log(`ZMQKernel: process exited with code ${code}, signal ${signal}`);
      // Retirement detaches this owner's handlers from the old child. The
      // identity guard also rejects a saved callback already queued before
      // detachment, so it cannot describe the replacement process's state.
      if (this.kernelProcess !== childProcess) {
        log("ZMQKernel: ignoring the exit of a process already replaced");
        return;
      }
      // Destroy already stopped the timers, closed the sockets and settled
      // everything; the process it killed has nothing left to report.
      if (this.transport._destroyed) {
        return;
      }
      // Node can deliver trailing pipe data after "exit". Keep decoding until
      // stderr ends/closes; the tail already retains even unterminated text.
      // Past the identity guard, this is the current process — whichever
      // phase it died in, its probe and watchdog have nothing to attend.
      this.transport._stopReadyProbe();
      this.transport._stopAckWatchdog();
      if (
        this.rejectInitialization(
          new Error(
            processDetail(
              `Kernel exited during initialization (code ${code}${signal ? `, signal ${signal}` : ""}).`,
            ),
          ),
        )
      ) {
        return;
      }

      if (this.expectingExit) {
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
        this.expectingExit = false;
        this.transport.setLifecycle("dead");
        this.transport.setExecutionState("dead");
        this.transport.emitDidLoseKernel("Kernel shut down");
        this.transport._clearState("Kernel shut down");
        // A kernel that never became ready was never registered, so no
        // destroy is coming to release what it holds.
        if (!this.everReady) {
          this.transport._releaseSockets(false);
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

      if (this.transport.lifecycle === "restarting") {
        // Only the new process can reach here — the identity guard filters
        // the one the restart killed — so the restart's own spawn died before
        // becoming ready. Left unhandled, the probe exhausts in silence and
        // `_socketRestart`'s reentry guard swallows every further restart:
        // the kernel wedges in "restarting" for the life of the window.
        this.transport._discardReadyProbes();
        this.transport._cancelReadiness?.();
        this.transport.setLifecycle("dead");
        // The bar too: `_socketRestart` set it to "restarting", and with no
        // destroy coming, nothing else would ever move it again.
        this.transport.setExecutionState("dead");
        this.transport.emitDidLoseKernel("Kernel process died during restart");
        lumine.notifications.addError("Kernel restart failed", {
          description:
            "The new kernel process died before it became ready. Restart again to retry.",
          detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${processDetail(`Exit code ${code}${signal ? `, signal ${signal}` : ""}`)}`,
          dismissable: true,
        });
        this.transport._clearState("Kernel process died during restart");
        return;
      }

      if (!this.everReady) {
        // Died during its own first startup. Judged by this kernel's flag,
        // never by `store.startingKernels`: another launch can own a separate
        // marker even when both kernels use the same spec.
        this.transport._clearStartingMarker();
        if (code !== 0) {
          lumine.notifications.addError("Kernel error", {
            detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${processDetail(
              `Process exited with code ${code}${signal ? `, signal ${signal}` : ""}`,
            )}`,
            dismissable: true,
          });
        }
        // Close sockets to prevent them from reconnecting to a new kernel
        // (ZMQ auto-reconnect + OS port reuse could cause signature mismatches)
        this.transport._releaseSockets(false);

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
      this.transport.setLifecycle("dead");
      // A crash mid-cell otherwise leaves the bar at "busy" for good.
      this.transport.setExecutionState("dead");
      this.transport.emitDidLoseKernel("Kernel process exited");
      if ((code !== 0 && code !== null) || signal) {
        const codeHex = code > 255 ? ` (0x${(code >>> 0).toString(16).toUpperCase()})` : "";
        lumine.notifications.addError("Kernel process died", {
          description:
            "The kernel process exited unexpectedly while running. " +
            "Restart the kernel to continue working.",
          detail: `Kernel: ${this.transport.kernelSpec.display_name}\n\n${processDetail(
            `Exit code ${code}${codeHex}${signal ? `, signal ${signal}` : ""}`,
          )}`,
          dismissable: true,
        });
      }
      this.transport._clearState("Kernel process exited");
    });
  }

  shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    let resolveShutdown;
    let rejectShutdown;
    const shutdown = new Promise((resolve, reject) => {
      resolveShutdown = resolve;
      rejectShutdown = reject;
    });
    // Publish the latch before entering the async body. Its synchronous prefix
    // marks the exit expected and may settle callbacks reentrantly.
    this.shutdownPromise = shutdown;
    Promise.resolve(this.transport._socketShutdown()).then(resolveShutdown, rejectShutdown);
    return shutdown;
  }

  async socketShutdown() {
    this.rejectInitialization(new Error("Kernel is shutting down"));
    if (!this.sockets.shellSocket) {
      return;
    }
    if (this.transport.lifecycle === "recovering" || this.transport.lifecycle === "unresponsive") {
      if (this.transport.lifecycle === "recovering" && this.transport._activeShellRequest) {
        this.transport._quarantine(
          this.transport._activeShellRequest,
          "The kernel was shut down before the uncertain request was acknowledged.",
        );
      }
      this.expectingExit = true;
      const child = this.kernelProcess;
      const retirement = this._retireProcess(child);
      await Promise.all([
        this.transport._clearRecovery(),
        this.transport._releaseSockets(false, true),
      ]);
      await this._killRetiredProcess(retirement);
      return;
    }
    // Before the send, so however fast the kernel exits, the exit handler
    // already knows it was asked for.
    this.expectingExit = true;
    const requestId = `shutdown_${randomUUID()}`;

    const message = this.transport._createMessage("shutdown_request", requestId);
    message.content = { restart: false };

    // Sent directly rather than through `_sendShellMessage`: that registers a
    // callback entry and makes the send conditional on the entry still being
    // there when its turn comes. For every other request that check is right,
    // but the teardown it guards against is exactly the one this request is
    // supposed to precede — `destroy` clears the table in the same tick, so
    // the send was skipped as stale every single time.
    try {
      await this.sockets.shellSocket.send(new Message(message));
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
    await this.transport._releaseSockets(false);

    await this.transport._awaitProcessExit(this.transport.constructor.SHUTDOWN_TIMEOUT_MS);
  }

  awaitProcessExit(timeoutMs) {
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

  restart(onRestarted) {
    // A kernel already asked to go is going; its sockets are released and a
    // destroy is on its way. Restarting it would spawn a process against
    // sockets that no longer exist.
    if (this.shutdownPromise || this.transport.lifecycle === "shutting-down") {
      log("ZMQKernel: restart refused, shutdown already in progress");
      lumine.notifications.addWarning("Restart ignored, the kernel is shutting down", {
        detail: `Kernel: ${this.transport.kernelSpec.display_name}`,
        dismissable: true,
      });
      return Promise.resolve(false);
    }
    if (!this.transport.canRestart) return Promise.resolve(false);
    if (this.restartPromise) {
      if (onRestarted) this.restartPromise.then((restarted) => restarted && onRestarted());
      return this.restartPromise;
    }
    const { promise: restarting, resolve } = Promise.withResolvers();
    // Reserve the operation before emitting state changes or settling work.
    this.restartPromise = restarting;
    const finish = (restarted) => {
      if (this.restartPromise === restarting) this.restartPromise = null;
      resolve(restarted);
    };
    if (onRestarted) restarting.then((restarted) => restarted && onRestarted());
    this.transport._replaceConnectionGeneration().then(finish, (error) => {
      log("ZMQKernel: restart error:", error);
      finish(false);
    });
    return restarting;
  }

  async replace() {
    if (this.transport._destroyed || this.shutdownPromise) return false;
    this.expectingExit = false;
    this.transport.setLifecycle("restarting");
    if (this.transport._destroyed || this.shutdownPromise) return false;
    this.transport.setExecutionState("restarting");
    if (this.transport._destroyed || this.shutdownPromise) return false;
    this.transport._stopAckWatchdog();
    this.transport._dismissUnresponsiveNotification();
    const recoveryClosed = this.transport._clearState("Kernel restarted", false, true);
    if (this.transport._destroyed || this.shutdownPromise) return false;

    const oldProcess = this.kernelProcess;
    const oldConnectionFile = this.connectionFile;
    const oldListeners = this.detachProcess(oldProcess);
    const retirement = this._retireProcess(oldProcess);
    // Make the old process's exit handler stale before terminating it.
    this.kernelProcess = null;
    await Promise.all([recoveryClosed, this.transport._releaseSockets(false, true)]);
    try {
      await this._killRetiredProcess(retirement);
    } catch (error) {
      this.kernelProcess = oldProcess;
      this.restoreProcess(oldProcess, oldListeners);
      this.transport.setLifecycle("unresponsive");
      this.transport.setExecutionState("unresponsive");
      this.transport._showUnresponsiveNotification(
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
    if (this.transport._destroyed || this.shutdownPromise) return false;

    try {
      const { config, connectionFile, spawn } = await this.transport._launchFreshGeneration();
      if (this.transport._destroyed || this.shutdownPromise) {
        const abandoned = this._retireProcess(spawn);
        try {
          await this._killRetiredProcess(abandoned);
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
      this.adopt({ config, connectionFile, spawn }, true);
      await this.initialize(spawn, true);
      if (this.transport._destroyed || this.shutdownPromise) return false;
      return true;
    } catch (error) {
      const failedProcess = this.kernelProcess;
      const failedConnectionFile = this.connectionFile;
      const failedListeners = this.detachProcess(failedProcess);
      const failedRetirement = this._retireProcess(failedProcess);
      this.kernelProcess = null;
      await this.transport._releaseSockets(false, true);
      try {
        await this._killRetiredProcess(failedRetirement);
      } catch (killError) {
        this.kernelProcess = failedProcess;
        this.restoreProcess(failedProcess, failedListeners);
        this.transport.setLifecycle("unresponsive");
        this.transport.setExecutionState("unresponsive");
        this.transport._showUnresponsiveNotification(
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
      if (this.transport._destroyed || this.shutdownPromise) return false;
      const alreadyDead = this.transport.lifecycle === "dead";
      this.transport.setLifecycle("dead");
      this.transport.setExecutionState("dead");
      if (!alreadyDead) {
        lumine.notifications.addError("Kernel restart failed", {
          detail: `Kernel: ${this.transport.displayName}\n\n${error.message}`,
          dismissable: true,
        });
      }
      throw error;
    }
  }

  launchFresh() {
    return launchSpec(this.transport.kernelSpec, this.options);
  }

  killProcessTree(childProcess) {
    return killProcessTree(childProcess);
  }

  /** Adopt a complete launch result before any startup callback can observe it. */
  adopt({ config, connectionFile, spawn }, freshSession = false) {
    this.epoch++;
    if (freshSession) this.sessionId = randomUUID();
    this.config = config;
    this.connectionFile = connectionFile;
    this.kernelProcess = spawn;
  }

  detachProcess(childProcess) {
    const listeners = this.processListeners.get(childProcess) || [];
    this.processListeners.delete(childProcess);
    const streams = new Set();
    for (const { emitter, event, callback } of listeners) {
      emitter.removeListener?.(event, callback);
      if (event === "data") streams.add(emitter);
    }
    // These pipes must keep draining until the retired process exits, even if
    // somebody paused one before its generation was detached.
    for (const stream of streams) stream.resume?.();
    return listeners;
  }

  restoreProcess(childProcess, listeners) {
    if (!listeners?.length || this.transport._destroyed) return;
    this.processListeners.set(childProcess, listeners);
    for (const { emitter, event, callback } of listeners) emitter.on(event, callback);
  }

  /**
   * The native close can finish before the observer does. Keep the socket
   * reachable until both resources are released so window unload can escalate
   * a normal close still waiting on its send or observer.
   */
  retireSocket(socket, forUnload = false, discardPending = false) {
    const previous = this.retiringSockets.get(socket);
    const discard = Boolean(discardPending || previous?.discardPending);
    const closed = Promise.resolve(socket.close(forUnload, discard));
    const resources = Promise.resolve(socket.closedResources || closed);
    const retirement = { resources, discardPending: discard };
    this.retiringSockets.set(socket, retirement);
    this._observeRetirement();
    const release = () => {
      if (this.retiringSockets.get(socket) === retirement) this.retiringSockets.delete(socket);
      this._observeRetirement();
    };
    resources.then(release, release);
    return closed;
  }

  async releaseSockets(forUnload, discardPending = false) {
    const pending = new Map();
    for (const name of ["shellSocket", "ioSocket", "stdinSocket"]) {
      const socket = this.sockets[name];
      if (!socket) continue;
      this.sockets[name] = null;
      pending.set(socket, name);
    }
    if (forUnload) {
      for (const socket of this.retiringSockets.keys()) {
        if (!pending.has(socket)) pending.set(socket, "retiring socket");
      }
    }
    const closes = [];
    for (const [socket, name] of pending) {
      try {
        socket.removeAllListeners();
        closes.push(this.retireSocket(socket, forUnload, discardPending));
      } catch (error) {
        log(`ZMQKernel: Error closing ${name}:`, error.message);
      }
    }
    await Promise.all(closes);
  }

  destroy(forUnload, recoveryClosed, discardPending) {
    // Close sockets first, while the peer still lives: the close is deferred
    // past any in-flight send, and an orderly zmq disconnect beats closing
    // into the RST storm of a killed process. After a graceful shutdown the
    // sockets are already gone — released while the kernel ran its atexit —
    // and this finds nothing left to do.
    const child = this.kernelProcess;
    this.detachProcess(child);
    if (forUnload) {
      this._unloading = true;
      this._unloadSubscription?.dispose();
      this._unloadSubscription = null;
    }
    if (child || this.retiringProcesses.size === 0) this._retireProcess(child);
    this.kernelProcess = null;
    const socketsClosed = this.transport._releaseSockets(forUnload, discardPending);
    const pending = [...this.retiringProcesses.values()];
    const kill = () =>
      Promise.all(
        pending.map((retirement) =>
          this._killRetiredProcess(retirement).catch((error) => {
            // Keep a surviving child reachable for a later cleanup retry.
            if (
              !this.kernelProcess &&
              this.retiringProcesses.get(retirement.child) === retirement
            ) {
              this.kernelProcess = retirement.child;
            }
            log("ZMQKernel: Error killing process:", error.message);
          }),
        ),
      );
    if (forUnload) {
      // Both close paths are synchronous for unload; do not depend on a later
      // microtask while the renderer is being torn down.
      this.teardownPromise = Promise.resolve(kill());
    } else {
      this.teardownPromise = Promise.all([recoveryClosed, socketsClosed]).then(kill);
    }

    // Clean up connection file (non-fatal if it fails)
    try {
      fs.unlinkSync(this.connectionFile);
    } catch (err) {
      log("ZMQKernel: Failed to delete connection file:", err.message);
    }

    return this.teardownPromise;
  }

  _retireProcess(child) {
    let retirement = this.retiringProcesses.get(child);
    if (!retirement || retirement.failed) {
      retirement = { child, killPromise: null, failed: false };
      this.retiringProcesses.set(child, retirement);
      this._observeRetirement();
    }
    return retirement;
  }

  _killRetiredProcess(retirement, kill = () => this.transport._killProcessTree(retirement.child)) {
    if (retirement.killPromise) return retirement.killPromise;
    let resolve, reject;
    const killed = new Promise((done, fail) => {
      resolve = done;
      reject = fail;
    });
    // Publish the latch before invoking the native kill: unload or a callback
    // can reenter destruction while this process is already being terminated.
    retirement.killPromise = killed;
    killed.then(
      () => {
        if (this.retiringProcesses.get(retirement.child) === retirement) {
          this.retiringProcesses.delete(retirement.child);
        }
        this._observeRetirement();
      },
      () => {
        // Keep this attempt latched for old continuations. An explicit retry
        // creates a new record, while the surviving process stays owned.
        retirement.failed = true;
        this._observeRetirement();
      },
    );
    try {
      Promise.resolve(kill()).then(resolve, reject);
    } catch (error) {
      reject(error);
    }
    return killed;
  }

  _observeRetirement() {
    if (this.retiringSockets.size === 0 && this.retiringProcesses.size === 0) {
      this._unloadSubscription?.dispose();
      this._unloadSubscription = null;
      return;
    }
    if (this._unloadSubscription || this._unloading) return;
    const windowService = typeof lumine === "undefined" ? null : lumine.window;
    this._unloadSubscription = windowService?.onWillDestroy?.(() => {
      if (this._unloading) return;
      this._unloading = true;
      this._unloadSubscription?.dispose();
      this._unloadSubscription = null;
      // The facade may already have left the running-kernel registry. This
      // owner still has the retired sockets and process records to force now.
      this.transport.destroy(true);
    });
  }
}

module.exports = ZMQConnectionGeneration;
