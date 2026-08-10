const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const { launchSpec, launchSpecFromConnectionInfo } = require("./kernel-launcher");
const Config = require("./config");
const KernelTransport = require("./kernel-transport");
const { log, js_idx_to_char_idx } = require("./utils");
const { Message, Socket } = require("./jmp");
const { msgSpecToNotebookFormat, OUTPUT_TYPES } = require("./output-utils");

class ZMQKernel extends KernelTransport {
  executionCallbacks = {};
  deferredExecuteReplies = new Map(); // requestId -> { message, callbackInfo }
  idleBeforeReply = new Map(); // requestId -> true (marker that idle arrived first)
  deferredIdleState = new Map(); // requestId -> { suppressStatus } - defer idle state until execute_reply
  // Queue for shell messages to prevent "Socket is busy writing" errors
  shellMessageQueue = [];
  shellSocketBusy = false;
  // Queue for stdin messages
  stdinMessageQueue = [];
  stdinSocketBusy = false;
  _connectionPromise = null;
  // Execution serialization - ensures only one execute request in flight at a time
  executionQueue = [];
  currentExecutionRequest = null;
  // Last output store for background thread output (WeakRef to avoid memory leaks)
  _lastOutputStore = null;
  // This client's Jupyter session id. The protocol stamps it on every request
  // we send, and the kernel copies it into the `parent_header` of everything it
  // publishes in response — which is what lets us tell our own traffic apart
  // from another client's on a shared kernel. It must therefore be unique per
  // connection: two Lumine windows on one kernel are two clients.
  sessionId = uuidv4();

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
      // If kernel exits before fully started (still in startingKernels), clean up
      const store = require("./store");
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
        if (this.shellSocket) {
          try {
            this.shellSocket.removeAllListeners();
            this.shellSocket.close();
          } catch (e) {
            log("ZMQKernel: Error closing shellSocket:", e.message);
          }
          this.shellSocket = null;
        }
        if (this.ioSocket) {
          try {
            this.ioSocket.removeAllListeners();
            this.ioSocket.close();
          } catch (e) {
            log("ZMQKernel: Error closing ioSocket:", e.message);
          }
          this.ioSocket = null;
        }
        if (this.stdinSocket) {
          try {
            this.stdinSocket.removeAllListeners();
            this.stdinSocket.close();
          } catch (e) {
            log("ZMQKernel: Error closing stdinSocket:", e.message);
          }
          this.stdinSocket = null;
        }

        // Also clean up connection file to avoid stale files
        if (this.connectionFile) {
          try {
            fs.unlinkSync(this.connectionFile);
          } catch (e) {
            // Ignore - file might not exist or already deleted
          }
          this.connectionFile = null;
        }
      } else if (
        !this._destroyed &&
        this.executionState !== "restarting" &&
        code !== 0 &&
        code !== null
      ) {
        // The kernel process died after startup (e.g. a native DLL crash).
        // Without this, pending executions never resolve and the UI spins
        // forever with no hint of what happened.
        const codeHex = code > 255 ? ` (0x${(code >>> 0).toString(16).toUpperCase()})` : "";
        lumine.notifications.addError(`${this.kernelSpec.display_name}: kernel process died`, {
          description:
            "The kernel process exited unexpectedly while running. " +
            "Restart the kernel to continue working.",
          detail: `Exit code ${code}${codeHex}${signal ? `, signal ${signal}` : ""}`,
          dismissable: true,
        });
        this._clearState();
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

      const finish = () => {
        if (finished) {
          return;
        }
        finished = true;
        this._stopReadyProbe();
        log("ZMQKernel: all main sockets connected");
        this.setExecutionState("idle");
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
        socket.on("connect", () => mark(socketName, "monitor"));
        // Traffic is ground truth: a reply proves shell, any iopub message
        // proves iopub, whatever the monitor thinks.
        socket.on("message", () => mark(socketName, "traffic"));
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
      const requestId = `ready_probe_${uuidv4()}`;
      this._queueShellMessage(
        this._createMessage("kernel_info_request", requestId),
        requestId,
        () => {},
      );
    };

    this._readyProbe = setInterval(probe, 500);
    probe();
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

  shutdown() {
    this._socketShutdown();
  }

  restart(onRestarted) {
    this._socketRestart(onRestarted);
  }

  _socketShutdown(restart = false) {
    const requestId = `shutdown_${uuidv4()}`;

    const message = this._createMessage("shutdown_request", requestId);

    message.content = {
      restart,
    };
    // Use queue to prevent "Socket is busy writing" errors
    this._queueShellMessage(message, requestId, () => {});
  }

  // Clear all pending state (used in restart and destroy)
  _clearState() {
    this.executionCallbacks = {};
    this.shellMessageQueue = [];
    this.stdinMessageQueue = [];
    this.deferredExecuteReplies.clear();
    this.idleBeforeReply.clear();
    this.deferredIdleState.clear();
    this.executionQueue = [];
    this.currentExecutionRequest = null;
    this._lastOutputStore = null;
  }

  _socketRestart(onRestarted) {
    if (this.executionState === "restarting") {
      return;
    }

    this.setExecutionState("restarting");
    this._clearState();

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

  // Queue a message to be sent on the shell socket
  // This prevents "Socket is busy writing" errors
  _queueShellMessage(message, requestId, onResults, suppressStatus = false) {
    this.executionCallbacks[requestId] = { callback: onResults, suppressStatus };
    this.shellMessageQueue.push({ message, requestId });
    this._processShellQueue();
  }

  // Process the shell message queue
  async _processShellQueue() {
    if (this.shellSocketBusy || this.shellMessageQueue.length === 0) {
      return;
    }

    this.shellSocketBusy = true;
    const { message, requestId } = this.shellMessageQueue.shift();

    try {
      await this.shellSocket.send(new Message(message));
    } catch (error) {
      log("ZMQKernel: Error sending shell message:", error);
      // Re-queue the message for retry if it's a transient error
      if (error.message && error.message.includes("busy")) {
        this.shellMessageQueue.unshift({ message, requestId });
      } else {
        // Non-transient error: notify callback about the failure
        const callbackInfo = this.executionCallbacks[requestId];
        if (callbackInfo) {
          delete this.executionCallbacks[requestId];
          // Create an error response in Jupyter message format
          const errorMessage = {
            header: { msg_type: "error", msg_id: requestId + "_error" },
            parent_header: {
              msg_id: requestId,
              msg_type: message.header?.msg_type || "execute_request",
            },
            content: {
              status: "error",
              ename: "SendError",
              evalue: error.message || "Failed to send message to kernel",
              traceback: [],
            },
          };
          callbackInfo.callback(errorMessage, "iopub");
          // Also send shell reply so createResultAsync can resolve
          const shellReply = {
            header: { msg_type: "execute_reply", msg_id: requestId + "_reply" },
            parent_header: {
              msg_id: requestId,
              msg_type: message.header?.msg_type || "execute_request",
            },
            content: {
              status: "error",
            },
          };
          callbackInfo.callback(shellReply, "shell");

          // This reply is synthesized here rather than received, so it never
          // reaches the shell handler that would retire the request. Release it
          // by hand: the slot admits one execution at a time, and leaving it
          // held would stall every later cell behind a request the kernel never
          // even saw.
          if (this.currentExecutionRequest === requestId) {
            this.currentExecutionRequest = null;
            setImmediate(() => this._processExecutionQueue());
          }
          if (!callbackInfo.suppressStatus) {
            this.setExecutionState("idle");
          }
        }
      }
    }

    this.shellSocketBusy = false;

    // Process next message if any
    if (this.shellMessageQueue.length > 0) {
      // Use setImmediate for better async behavior than setTimeout(fn, 1)
      setImmediate(() => this._processShellQueue());
    }
  }

  // Enqueue an execution request for serialized processing
  // Only one execute request will be in flight at a time
  _enqueueExecution(code, onResults, options = {}) {
    const requestId = `execute_${uuidv4()}`;

    this.executionQueue.push({
      requestId,
      code,
      onResults,
      options,
    });

    // We are busy from the moment the user asks, not from whenever the kernel
    // gets round to saying so. The gap is ours to cover: the kernel answers a
    // request queued behind another client's long cell only once that cell
    // finishes, and a result bubble reads a non-busy kernel under a running
    // cell as a failure. This also closes the same race against a merely slow
    // kernel, which used to show as a flash of the error marker.
    if (!options.suppressStatus) {
      this.setExecutionState("busy");
    }

    this._processExecutionQueue();
    return requestId;
  }

  // Process the execution queue - sends the next request if none in flight
  _processExecutionQueue() {
    // If a request is in flight or queue empty, do nothing
    if (this.currentExecutionRequest !== null || this.executionQueue.length === 0) {
      return;
    }

    const request = this.executionQueue.shift();
    this.currentExecutionRequest = request.requestId;

    const message = this._createMessage("execute_request", request.requestId);
    message.content = {
      code: request.code,
      silent: request.options.silent || false,
      store_history: request.options.store_history !== false,
      user_expressions: {},
      allow_stdin: request.options.allow_stdin !== false,
    };

    this._queueShellMessage(
      message,
      request.requestId,
      request.onResults,
      request.options.suppressStatus,
    );
  }

  // onResults is a callback that may be called multiple times
  // as results come in from the kernel
  execute(code, onResults, options = {}) {
    log("ZMQKernel.execute:", code);
    this._enqueueExecution(code, onResults, {
      silent: options.silent ?? false,
      store_history: options.store_history ?? true,
      allow_stdin: options.allow_stdin ?? true,
      suppressStatus: options.suppressStatus ?? false,
    });
  }

  /**
   * Execute code silently without affecting status bar timer or execution count.
   * Used for internal operations like variable explorer refresh.
   * NOTE: silent:true means NO output is published on IOPub - use executeWatch for watches.
   */
  executeSilent(code, onResults) {
    this.execute(code, onResults, {
      silent: true,
      store_history: false,
      allow_stdin: false,
      suppressStatus: true,
    });
  }

  /**
   * Execute code for watch pane - gets output but doesn't affect status bar or history.
   * Unlike executeSilent, this allows IOPub output (execute_result, stream, etc.)
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
    this._queueShellMessage(message, requestId, onResults, true);
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
    this._queueShellMessage(message, requestId, onResults, true);
  }

  inputReply(input) {
    const requestId = `input_reply_${uuidv4()}`;

    const message = this._createMessage("input_reply", requestId);

    message.content = {
      value: input,
    };
    this._queueStdinMessage(message);
  }

  // Queue a message to be sent on the stdin socket
  _queueStdinMessage(message) {
    this.stdinMessageQueue.push(message);
    this._processStdinQueue();
  }

  // Process the stdin message queue
  async _processStdinQueue() {
    if (this.stdinSocketBusy || this.stdinMessageQueue.length === 0) {
      return;
    }

    this.stdinSocketBusy = true;
    const message = this.stdinMessageQueue.shift();

    try {
      await this.stdinSocket.send(new Message(message));
    } catch (error) {
      log("ZMQKernel: Error sending stdin message:", error);
      if (error.message && error.message.includes("busy")) {
        this.stdinMessageQueue.unshift(message);
      }
    }

    this.stdinSocketBusy = false;

    if (this.stdinMessageQueue.length > 0) {
      setImmediate(() => this._processStdinQueue());
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
    let callbackInfo;

    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    if (callbackInfo) {
      const { msg_type } = message.header;
      if (msg_type === "execute_reply") {
        this._queueExecuteReply(message, callbackInfo);
      } else {
        // Clean up callback for complete_reply, inspect_reply, etc.
        // These are one-shot requests that don't need to persist
        delete this.executionCallbacks[msg_id];
        callbackInfo.callback(message, "shell");
      }
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
      callbackInfo.callback(message, "stdin");
    }
  }

  onIOMessage(message) {
    // Guard against messages arriving after destruction
    if (this._destroyed) return;

    log("IO message:", message);

    if (!_isValidMessage(message)) {
      return;
    }

    const { msg_type } = message.header;
    const { msg_id } = message.parent_header;

    // IOPub is a broadcast: one kernel can serve several clients, and every one
    // of them publishes here. Attribute the message before acting on it. Work
    // another client asked for is that client's to display and that client's
    // execution state to report — and it already has both, so there is nothing
    // to salvage by handling it here. Without this test its output lands in
    // whichever inline result bubble we happened to fill last, and its idle
    // status marks our own running cell as failed.
    if (!this._isOwnMessage(message)) {
      log("Dropped IO message belonging to another client:", msg_type);
      return;
    }

    // Get callback info for this request
    let callbackInfo;
    if (msg_id) {
      callbackInfo = this.executionCallbacks[msg_id];
    }

    // Check if this request should suppress status bar updates
    const suppressStatus = callbackInfo?.suppressStatus ?? false;

    // Forward the iopub message to the callback FIRST, before any cleanup
    if (callbackInfo) {
      callbackInfo.callback(message, "iopub");
    } else if (msg_id && (OUTPUT_TYPES.includes(msg_type) || msg_type === "clear_output")) {
      // No callback left, but the message is ours: output from a background
      // thread, which the kernel attributes to whichever of our cells ran last.
      this._routeOrphanOutput(message);
    }

    // Handle status messages after forwarding
    if (msg_type === "status") {
      const status = message.content.execution_state;
      if (status === "idle") {
        // Try to flush the deferred shell reply first
        const flushed = this._flushExecuteReply(msg_id);
        if (flushed) {
          // Execute reply was waiting, shell callback ran, now safe to update state
          if (!this._destroyed && !suppressStatus) {
            this.setExecutionState(status);
          }
        } else if (msg_id && msg_id.startsWith("execute_")) {
          // Only defer idle for execute requests - they need to wait for execute_reply
          // This avoids the race condition where ResultView sees idle + running = error
          this.deferredIdleState.set(msg_id, { suppressStatus });
        } else {
          // For complete/inspect/other requests, set idle immediately
          // These don't have execute_reply, so deferring would block forever
          if (!this._destroyed && !suppressStatus) {
            this.setExecutionState(status);
          }
        }
      } else {
        // For non-idle states (busy, starting), update immediately
        if (!this._destroyed && !suppressStatus) {
          this.setExecutionState(status);
        }
      }
    }
  }

  destroy(forUnload = false) {
    log("ZMQKernel: destroy:", this);

    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;
    this._stopReadyProbe();

    // Clear pending state first to prevent errors during shutdown
    this._clearState();

    // Remove all socket event listeners before closing to prevent callbacks during close
    if (this.shellSocket) {
      try {
        this.shellSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing shellSocket listeners:", e.message);
      }
    }
    if (this.ioSocket) {
      try {
        this.ioSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing ioSocket listeners:", e.message);
      }
    }
    if (this.stdinSocket) {
      try {
        this.stdinSocket.removeAllListeners();
      } catch (e) {
        log("ZMQKernel: Error removing stdinSocket listeners:", e.message);
      }
    }

    // Close sockets first, while the peer still lives: the close is deferred
    // past any in-flight send, and an orderly zmq disconnect beats closing
    // into the RST storm of a killed process.
    if (this.shellSocket) {
      try {
        this.shellSocket.close(forUnload);
      } catch (e) {
        log("ZMQKernel: Error closing shellSocket:", e.message);
      }
    }
    if (this.ioSocket) {
      try {
        this.ioSocket.close(forUnload);
      } catch (e) {
        log("ZMQKernel: Error closing ioSocket:", e.message);
      }
    }
    if (this.stdinSocket) {
      try {
        this.stdinSocket.close(forUnload);
      } catch (e) {
        log("ZMQKernel: Error closing stdinSocket:", e.message);
      }
    }

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
  _queueExecuteReply(message, callbackInfo) {
    const requestId = message.parent_header.msg_id;
    if (!requestId) {
      callbackInfo.callback(message, "shell");
      return;
    }

    // Release current execution request when shell reply arrives
    if (this.currentExecutionRequest === requestId) {
      this.currentExecutionRequest = null;
      setImmediate(() => this._processExecutionQueue());
    }

    if (this.idleBeforeReply.has(requestId)) {
      this.idleBeforeReply.delete(requestId);
      // Clean up the callback after shell reply is sent
      delete this.executionCallbacks[requestId];
      callbackInfo.callback(message, "shell");

      // Now set the deferred idle state (idle arrived before execute_reply)
      const deferred = this.deferredIdleState.get(requestId);
      if (deferred) {
        this.deferredIdleState.delete(requestId);
        if (!this._destroyed && !deferred.suppressStatus) {
          this.setExecutionState("idle");
        }
      }
      return;
    }

    this.deferredExecuteReplies.set(requestId, {
      message,
      callbackInfo,
    });
  }

  /**
   * Attempts to flush a deferred execute reply.
   * @returns {boolean} true if execute_reply was pending and flushed, false if not yet received
   */
  _flushExecuteReply(requestId) {
    if (!requestId) {
      return false;
    }

    const pending = this.deferredExecuteReplies.get(requestId);
    if (pending) {
      this.deferredExecuteReplies.delete(requestId);
      // Clean up the callback after shell reply is sent
      delete this.executionCallbacks[requestId];
      // Release current execution request
      if (this.currentExecutionRequest === requestId) {
        this.currentExecutionRequest = null;
        setImmediate(() => this._processExecutionQueue());
      }
      pending.callbackInfo.callback(pending.message, "shell");
      return true; // Flushed successfully
    }

    // Execute reply hasn't arrived yet - mark that idle arrived first
    this.idleBeforeReply.set(requestId, true);
    return false;
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
   * A kernel copies the requesting client's header into `parent_header`, so its
   * session names the client the work belongs to. Everything else on the socket
   * belongs to some other client — a `jupyter console` sharing the connection
   * file, or a second Lumine window — and is that client's to display.
   *
   * A kernel that publishes no session falls back to our request-id namespace,
   * which keeps a non-conforming kernel behaving as it did before rather than
   * going silent.
   */
  _isOwnMessage(message) {
    const { session, msg_id } = message.parent_header;
    return session ? session === this.sessionId : _isOwnRequestId(msg_id);
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

// Every request this client sends is tagged with one of these, so a msg_id
// carrying none of them was minted by somebody else. Only consulted for kernels
// that publish no session of their own to compare against.
const REQUEST_ID_PREFIXES = [
  "execute_",
  "complete_",
  "inspect_",
  "input_reply_",
  "shutdown_",
  "ready_probe_",
];

function _isOwnRequestId(msgId) {
  return (
    typeof msgId === "string" && REQUEST_ID_PREFIXES.some((prefix) => msgId.startsWith(prefix))
  );
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
