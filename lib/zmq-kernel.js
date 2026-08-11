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
  _connectionPromise = null;
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

    this._startAckWatchdog();
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
        const onConnect = () => mark(socketName, "monitor");
        // Traffic is ground truth: a reply proves shell, any iopub message
        // proves iopub, whatever the monitor thinks.
        const onMessage = () => mark(socketName, "traffic");
        socket.on("connect", onConnect);
        socket.on("message", onMessage);
        readinessListeners.push(
          { socket, event: "connect", listener: onConnect },
          { socket, event: "message", listener: onMessage },
        );
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
      this._sendShellMessage(
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
    this._sendShellMessage(message, requestId, () => {});
  }

  // Clear all pending state (used in restart and destroy)
  _clearState() {
    this.executionCallbacks = {};
    this._lastOutputStore = null;
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
      // An execute request is answered twice — shell reply and trailing iopub
      // idle — and its callback lives until both have arrived (_retireExecution).
      replySeen: false,
      idleSeen: false,
      // For the acknowledgment watchdog: flipped by the first message the
      // kernel sends about this request, on any channel.
      acked: false,
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
   * A comm message normally acquires `acked` from the same busy status any
   * request does, so this never sees one. A kernel that publishes no status
   * for comm messages is the exception, and there _settleUnanswered reclaims
   * the entry silently — there is no caller waiting to be told.
   */
  static ACK_IDLE_TIMEOUT_MS = 30000;

  _startAckWatchdog() {
    this._stopAckWatchdog();
    this._ackWatchdog = setInterval(() => {
      if (this._destroyed || this.lifecycle !== "ready" || this.executionState !== "idle") {
        return;
      }
      const now = Date.now();
      for (const [requestId, callbackInfo] of Object.entries(this.executionCallbacks)) {
        if (callbackInfo.acked) {
          continue;
        }
        // Count only the stretch in which the kernel was both idle and had
        // the request: idle since before it was sent, or ever since.
        const unattendedSince = Math.max(callbackInfo.armedAt, this.idleSince ?? now);
        if (now - unattendedSince > ZMQKernel.ACK_IDLE_TIMEOUT_MS) {
          log("ZMQKernel: request never acknowledged, settling:", requestId);
          this._settleUnanswered(
            requestId,
            callbackInfo.requestType,
            "NoReplyError",
            "The kernel never acknowledged this request. Restart the kernel if this persists.",
          );
        }
      }
    }, 10000);
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
   */
  _settleUnanswered(requestId, requestType, ename, evalue) {
    const callbackInfo = this.executionCallbacks[requestId];
    if (!callbackInfo) {
      return;
    }
    delete this.executionCallbacks[requestId];

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
        header: { msg_type: "execute_reply", msg_id: requestId + "_reply" },
        parent_header,
        content: { status: "error" },
      },
      "shell",
    );
    callbackInfo.callback(
      {
        header: { msg_type: "status", msg_id: requestId + "_idle" },
        parent_header,
        content: { execution_state: "idle" },
      },
      "iopub",
    );
    if (!callbackInfo.suppressStatus) {
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
    callbackInfo.acked = true;

    const { msg_type } = message.header;
    if (msg_type === "execute_reply") {
      callbackInfo.callback(message, "shell");
      callbackInfo.replySeen = true;
      this._retireExecution(msg_id, callbackInfo);
    } else {
      // One-shot requests — complete_reply, inspect_reply, kernel_info_reply —
      // are finished the moment they are answered.
      delete this.executionCallbacks[msg_id];
      callbackInfo.callback(message, "shell");
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
      callbackInfo.acked = true;
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
    const suppressStatus = callbackInfo?.suppressStatus ?? false;

    if (own) {
      // Forward the iopub message to the callback FIRST, before any cleanup
      if (callbackInfo) {
        callbackInfo.acked = true;
        callbackInfo.callback(message, "iopub");
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
      if (callbackInfo && message.content.execution_state === "idle") {
        callbackInfo.idleSeen = true;
        this._retireExecution(msg_id, callbackInfo);
      }
      if (!this._destroyed && !suppressStatus) {
        this.setExecutionState(message.content.execution_state);
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
   */
  _retireExecution(msgId, callbackInfo) {
    const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
    if (replyDone && callbackInfo.idleSeen) {
      delete this.executionCallbacks[msgId];
    }
  }

  destroy(forUnload = false) {
    log("ZMQKernel: destroy:", this);

    // Mark as destroyed to prevent any further state updates
    this._destroyed = true;
    this._stopReadyProbe();
    this._stopAckWatchdog();

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
