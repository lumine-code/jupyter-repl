const { Disposable } = require("lumine");
const { randomUUID } = require("node:crypto");

const KernelTransport = require("./kernel-transport");
const { Comm } = require("./comm");
const { OUTPUT_TYPES } = require("./output-utils");
const { log, js_idx_to_char_idx } = require("./utils");

const RESET_STATUSES = new Set(["restarting", "autorestarting"]);

function waitUnlessAborted(promise, signal) {
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([promise, cancelled]).finally(() =>
    signal.removeEventListener("abort", abort),
  );
}

function unavailableError(reason) {
  return Object.assign(new Error(reason), { name: "KernelUnresponsive" });
}

/**
 * The reply to hand back when JupyterLab rejects a request instead of
 * answering it — the session being disposed, the kernel restarting, the
 * gateway erroring. Swallowed, as it used to be, it leaves the caller's
 * promise pending for the life of the window.
 *
 * The full envelope is required: `protectFromInvalidMessages` in the
 * middleware drops anything missing a header, a parent header with both an id
 * and a type, or content. The parent id is invented — `requestComplete`
 * returns a promise rather than a future, so the real one is not in hand — so
 * a plugin middleware correlating on it will not find a match.
 */
function _failedReply(requestType, error) {
  const requestId = `${requestType}_failed`;
  return {
    header: { msg_id: `${requestId}_reply`, msg_type: requestType.replace(/_request$/, "_reply") },
    parent_header: { msg_id: requestId, msg_type: requestType },
    content: {
      status: "error",
      ename: error?.name === "KernelUnresponsive" ? error.name : "NoReplyError",
      evalue: error?.message || "The kernel never answered this request.",
      traceback: [],
    },
  };
}

class WSKernel extends KernelTransport {
  supportsComms = true;
  // Retired observations still need exact ownership until reply + idle. Stop
  // accepting more queries rather than evict an identity whose traffic is live.
  static MAX_QUERY_REQUESTS = 64;
  static RESTART_TIMEOUT_MS = 60000;
  static PROBE_TIMEOUT_MS = 3000;
  _queryRequests = new Map();
  _generation = 0;
  _queryDispatch = null;
  _pendingRequests = new Set();
  _signalSubscriptions = [];
  _commTargets = new Map();

  constructor(
    gatewayName,
    kernelSpec,
    grammar,
    session,
    managers = {},
    languageInfo = null,
    ownsKernelProcess = false,
  ) {
    super(kernelSpec, grammar);
    this.ownsKernelProcess = ownsKernelProcess;
    this.setLanguageInfo(languageInfo);
    this.gatewayName = gatewayName;
    // Store managers so we can dispose them on destroy
    this._sessionManager = managers.sessionManager;
    this._kernelManager = managers.kernelManager;
    // One Comm wrapper per JupyterLab comm, so getComm and repeated lookups
    // agree on object identity the way the ZMQ registry does.
    this._commWrappers = new Map();
    this._attachSession(session);
    this.setExecutionState(session.kernel?.status || "unknown");
    this.setLifecycle("ready");
  }

  _attachSession(session) {
    this.session = session;
    this._sessionAttached = true;
    const kernel = (this._connection = session.kernel);
    this._observe(kernel?.statusChanged, (_sender, status) => {
      if (RESET_STATUSES.has(status)) {
        if (!this._restart && !this._lost && !this._closing) {
          this._beginRestart(`Kernel ${status}`, false);
        }
      } else if (status === "dead") {
        this._loseKernel("The kernel died");
      } else if (this.lifecycle === "ready" && status !== "busy" && status !== "idle") {
        // busy/idle are published from IOPub, which carries request identity.
        this.setExecutionState(status);
      }
    });
    this._observe(kernel?.connectionStatusChanged, (_sender, status) => {
      if (status === "disconnected") {
        this._loseKernel("The connection to the kernel was lost");
      } else if (status === "connecting" && this.lifecycle === "ready") {
        this.setLifecycle("recovering");
      } else if (status === "connected" && this.lifecycle === "recovering") {
        // A reconnect without a restart retains the same process and futures.
        this.setLifecycle("ready");
      }
    });
    this._observe(kernel?.disposed, () => this._loseKernel("The kernel connection was disposed"));
    this._observe(session.kernelChanged, () => {
      if (session.kernel !== kernel)
        this._loseKernel("The session's kernel changed", { detach: true });
    });

    // The count and the per-cell timer follow the kernel too: iopubMessage
    // carries every client's traffic, where our own requestExecute futures
    // would only ever show this editor's cells.
    this._observe(kernel?.iopubMessage, (_sender, message) => {
      if (this.lifecycle !== "ready" || message.parent_header?.msg_type === "kernel_info_request")
        return;
      const query = this._ownedQuery(message);
      if (message.header.msg_type === "status") {
        if (query) {
          if (message.content.execution_state === "idle") {
            query.idleSeen = true;
            this._releaseQuery(query);
          }
        } else this.setExecutionState(message.content.execution_state);
      }
      if (message.header.msg_type === "execute_input") {
        if (query) return;
        this.setExecutionCount(message.content.execution_count);
        this.setExecutionStartTime(Date.now());
        this.setLastExecutionTime("Running ...");
      }
    });

    this._observe(kernel?.anyMessage, (_sender, event) => {
      if (this.lifecycle !== "ready") return;
      const message = event?.msg;
      if (event?.direction === "send") this._captureQuery(message);
      if (event?.direction === "recv") this._recordQueryReply(message);
      if (
        event?.direction === "recv" &&
        message?.header?.msg_type === "kernel_info_reply" &&
        message.content?.language_info
      ) {
        this.setLanguageInfo(message.content.language_info);
      }
    });
    for (const [name, claim] of this._commTargets) this._attachCommTarget(name, claim);
  }

  _observe(signal, handler) {
    if (!signal) return;
    const session = this.session;
    const observe = (sender, value) => {
      if (this._sessionAttached && this.session === session) handler(sender, value);
    };
    signal.connect(observe);
    this._signalSubscriptions.push(() => signal.disconnect?.(observe));
  }

  _closeSession() {
    if (!this._sessionAttached) return;
    this._sessionAttached = false;
    this._connection = null;
    for (const disconnect of this._signalSubscriptions.splice(0)) disconnect();
    this.session.dispose();
  }

  _requestError() {
    const kernel = this.session.kernel;
    if (!this._destroyed && !this._lost && this.lifecycle !== "ready")
      return unavailableError(`The kernel is ${this.lifecycle}; this request was not sent.`);
    if (
      this._destroyed ||
      this._lost ||
      !kernel ||
      kernel !== this._connection ||
      kernel.isDisposed
    )
      return Object.assign(new Error("The session's kernel is gone."), { name: "KernelGone" });
    if (kernel.connectionStatus === "connecting")
      return unavailableError(
        "The kernel connection is being re-established; this request was not sent.",
      );
    return null;
  }

  _trackRequest(cancel) {
    const pending = this._pendingRequests;
    pending.add(cancel);
    return () => pending.delete(cancel);
  }

  _beginQuery(type) {
    if (this._queryRequests.size >= WSKernel.MAX_QUERY_REQUESTS) {
      const error = new Error(
        "Too many outstanding kernel queries. Wait for the existing requests to finish.",
      );
      error.name = "KernelUnresponsive";
      throw error;
    }
    return {
      type,
      generation: this._generation,
      id: null,
      session: null,
      replySeen: false,
      idleSeen: false,
    };
  }

  _dispatchRequest(query, send) {
    const previous = this._queryDispatch;
    this._queryDispatch = query;
    try {
      return send();
    } finally {
      this._queryDispatch = previous;
    }
  }

  _captureQuery(message) {
    const query = this._queryDispatch;
    if (
      !query ||
      query.id ||
      query.generation !== this._generation ||
      message?.header?.msg_type !== query.type ||
      !message.header.msg_id
    )
      return;
    query.id = message.header.msg_id;
    query.session = message.header.session;
    this._queryRequests.set(query.id, query);
  }

  _ownedQuery(message) {
    const query = this._queryRequests.get(message?.parent_header?.msg_id);
    if (!query || (query.session && query.session !== message.parent_header.session)) return null;
    return query;
  }

  _recordQueryReply(message) {
    const query = this._ownedQuery(message);
    if (query && message.header.msg_type === query.type.replace(/_request$/, "_reply")) {
      query.replySeen = true;
      this._releaseQuery(query);
    }
  }

  _releaseQuery(query) {
    // idleSeen means the global IOPub observer already classified that idle,
    // so removing the record cannot expose our own terminal state as user work.
    if (query.replySeen && query.idleSeen && this._queryRequests.get(query.id) === query)
      this._queryRequests.delete(query.id);
  }

  interrupt() {
    if (!this._requestError()) this.session.kernel.interrupt?.();
  }

  async shutdown() {
    this._closing = true;
    this._restart?.controller.abort(new Error("Kernel shut down"));
    this.setLifecycle("shutting-down");
    this.setExecutionState("shutting-down");
    this._retireConnection("Kernel shut down");
    if (!this._sessionAttached) {
      const { SessionAPI } = require("@jupyterlab/services");
      await SessionAPI.shutdownSession(this.session.id, this.session.serverSettings);
    } else if (typeof this.session.shutdown === "function") {
      await this.session.shutdown();
    } else {
      await this.session.kernel?.shutdown?.();
    }
  }

  get canRestart() {
    const kernel = this.session?.kernel;
    return Boolean(
      !this._destroyed &&
      !this._closing &&
      this._sessionManager &&
      (this._restart ||
        (kernel && kernel === this._connection && !kernel.isDisposed && kernel.status !== "dead")),
    );
  }

  restart(onRestarted) {
    if (!this.canRestart) {
      if (!this._destroyed && !this._closing) {
        lumine.notifications.addError("Cannot restart: the session's kernel is gone", {
          dismissable: true,
        });
      }
      return Promise.resolve(false);
    }
    const pending = this._restart?.promise ?? this._beginRestart("Kernel restarting", true);
    if (!onRestarted) return pending;
    return pending.then((restarted) => {
      if (restarted) onRestarted();
      return restarted;
    });
  }

  _beginRestart(reason, requested) {
    const controller = new AbortController();
    const operation = { controller, session: this.session, kernel: this._connection };
    this._restart = operation;
    operation.promise = Promise.resolve().then(() => this._restartConnection(operation, requested));
    this._lost = false;
    this.executionCount = 0;
    this.executionStartTime = null;
    this.lastExecutionTime = "No execution";
    this.setLifecycle("restarting");
    if (controller.signal.aborted) return operation.promise;
    this.setExecutionState("restarting");
    if (!controller.signal.aborted) this._retireConnection(reason);
    return operation.promise;
  }

  async _restartConnection(operation, requested) {
    const { controller, session, kernel } = operation;
    const { signal } = controller;
    const timer = setTimeout(() => {
      controller.abort(new Error("The kernel did not become ready after restarting."));
    }, WSKernel.RESTART_TIMEOUT_MS);
    try {
      signal.throwIfAborted();
      if (!requested) {
        // JupyterLab already scheduled its reconnect upon detecting the server's
        // restart. Let that socket handshake finish before disposing its client.
        await this._waitForConnection(kernel, signal);
      }
      const { KernelAPI, SessionAPI } = require("@jupyterlab/services");
      const settings = kernel.serverSettings;
      const requestSignal = settings.init.signal
        ? AbortSignal.any([signal, settings.init.signal])
        : signal;
      const apiSettings = { ...settings, init: { ...settings.init, signal: requestSignal } };
      this._closeSession();
      signal.throwIfAborted();
      if (requested) {
        await waitUnlessAborted(KernelAPI.restartKernel(kernel.id, apiSettings), requestSignal);
      }
      const model = await waitUnlessAborted(
        SessionAPI.getSessionModel(session.id, apiSettings),
        requestSignal,
      );
      requestSignal.throwIfAborted();
      if (model.kernel?.id !== kernel.id) {
        this._loseKernel("The session's kernel changed", { detach: true });
        return false;
      }
      // The gateway can retain ZMQ channels under the old client's session key.
      // Reattach to the same remote session with a fresh SDK client identity.
      const replacement = this._sessionManager.connectTo({
        model,
        kernelConnectionOptions: { handleComms: true },
      });
      this._attachSession(replacement);
      const reply = await this._probeRestart(replacement.kernel, signal);
      signal.throwIfAborted();
      this.setLanguageInfo(reply.content?.language_info);
      this.setExecutionState(replacement.kernel.status === "busy" ? "busy" : "idle");
      signal.throwIfAborted();
      this._connectionRetired = false;
      this.setLifecycle("ready");
      return this.lifecycle === "ready";
    } catch (error) {
      if (!this._lost && !this._destroyed && !this._closing) {
        if (!this._sessionAttached) {
          this._loseKernel(error.message, { detach: true });
        } else {
          this.setLifecycle("unresponsive");
          if (this.lifecycle === "unresponsive") this.setExecutionState("unresponsive");
        }
        log("WSKernel: restart error:", error);
        lumine.notifications.addError("Failed to restart kernel", {
          detail: error.message,
          dismissable: true,
        });
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (this._restart === operation) this._restart = null;
    }
  }

  async _waitForConnection(kernel, signal) {
    if (kernel.connectionStatus === "connected") return;
    const connected = Promise.withResolvers();
    const onConnection = (_sender, status) => {
      if (status === "connected") connected.resolve();
    };
    kernel.connectionStatusChanged.connect(onConnection);
    try {
      await waitUnlessAborted(connected.promise, signal);
    } finally {
      kernel.connectionStatusChanged.disconnect?.(onConnection);
    }
  }

  async _probeRestart(kernel, signal) {
    const { KernelMessage } = require("@jupyterlab/services");
    while (!signal.aborted) {
      await this._waitForConnection(kernel, signal);
      signal.throwIfAborted();
      const message = KernelMessage.createMessage({
        msgType: "kernel_info_request",
        channel: "shell",
        username: kernel.username,
        session: kernel.clientId,
        content: {},
      });
      const attempt = new AbortController();
      const timer = setTimeout(() => attempt.abort(), WSKernel.PROBE_TIMEOUT_MS);
      let future;
      try {
        // The SDK settles this future on the matching shell reply AND IOPub idle.
        // A connected WebSocket alone only proves the gateway has opened it.
        future = kernel.sendShellMessage(message, true);
        const reply = await waitUnlessAborted(
          future.done,
          AbortSignal.any([signal, attempt.signal]),
        );
        const status = reply?.content?.status;
        if (reply?.header?.msg_type !== "kernel_info_reply" || (status && status !== "ok"))
          throw new Error("The kernel returned an invalid readiness reply.");
        return reply;
      } catch (error) {
        signal.throwIfAborted();
        if (!attempt.signal.aborted && kernel.connectionStatus === "connected") throw error;
      } finally {
        clearTimeout(timer);
        future?.dispose();
      }
    }
    signal.throwIfAborted();
  }

  execute(code, onResults) {
    return this._execute(code, onResults, false);
  }

  executeWatch(code, onResults) {
    return this._execute(code, onResults, true);
  }

  _execute(code, onResults, watch) {
    const state = { replySeen: false, idleSeen: false, settled: false, observer: onResults };
    const deliver = (message, channel) => {
      try {
        state.observer?.(message, channel);
      } catch (error) {
        log("WSKernel: execution callback failed:", error);
      }
    };
    const unavailable = this._requestError();
    if (unavailable) {
      this._settleFailedExecution(
        deliver,
        state,
        `execute_failed_${randomUUID()}`,
        unavailable,
        true,
      );
      return;
    }
    const generation = this._generation;
    let future;
    try {
      const query = watch ? this._beginQuery("execute_request") : null;
      future = this._dispatchRequest(query, () =>
        this.session.kernel.requestExecute({
          code,
          ...(watch ? { silent: false, store_history: false, allow_stdin: false } : {}),
        }),
      );
    } catch (error) {
      this._settleFailedExecution(deliver, state, `execute_failed_${randomUUID()}`, error, true);
      return;
    }
    const fail = (error) => {
      untrack();
      this._settleFailedExecution(
        deliver,
        state,
        future.msg?.header?.msg_id || `execute_failed_${randomUUID()}`,
        error,
      );
    };
    const cancel = (reason) => {
      future.dispose?.();
      fail(new Error(reason));
    };
    const untrack = this._trackRequest(cancel);
    const receive = (message, channel) => {
      if (state.settled) return;
      if (channel === "shell" && message.header.msg_type === "execute_reply")
        state.replySeen = true;
      if (message.header.msg_type === "status" && message.content.execution_state === "idle") {
        state.idleSeen = true;
      }
      if (state.replySeen && state.idleSeen) {
        state.settled = true;
        untrack();
      }
      deliver(message, channel);
    };
    future.onIOPub = (message) => receive(message, "iopub");
    future.onReply = (message) => receive(message, "shell");
    future.onStdin = (message) => receive(message, "stdin");
    future.done?.then(untrack, fail);
    if (generation !== this._generation) cancel("The kernel connection changed.");
    return {
      cancelQueued: () => false,
      dispose: () => {
        state.observer = null;
      },
    };
  }

  _settleFailedExecution(deliver, state, requestId, error, notSent = false) {
    if (state.settled) return;
    state.settled = true;
    const parent_header = { msg_id: requestId, msg_type: "execute_request" };
    const content = {
      status: "error",
      ename: notSent
        ? ["KernelUnresponsive", "KernelGone"].includes(error?.name)
          ? error.name
          : "SendError"
        : "ExecutionOutcomeUnknown",
      evalue: notSent
        ? error?.message || "The execution request could not be sent."
        : `${error?.message || "The execution was cancelled before its reply arrived."} Its outcome is unknown.`,
      traceback: [],
    };
    if (!state.replySeen) {
      deliver(
        { header: { msg_id: `${requestId}_error`, msg_type: "error" }, parent_header, content },
        "iopub",
      );
      deliver(
        {
          header: { msg_id: `${requestId}_reply`, msg_type: "execute_reply" },
          parent_header,
          content,
        },
        "shell",
      );
    }
    if (!state.idleSeen) {
      deliver(
        {
          header: { msg_id: `${requestId}_idle`, msg_type: "status" },
          parent_header,
          content: { execution_state: "idle" },
        },
        "iopub",
      );
    }
  }

  complete(code, onResults) {
    return this._requestIntrospection(
      "requestComplete",
      "complete_request",
      {
        code,
        cursor_pos: js_idx_to_char_idx(code.length, code),
      },
      onResults,
    );
  }

  inspect(code, cursorPos, onResults) {
    return this._requestIntrospection(
      "requestInspect",
      "inspect_request",
      {
        code,
        cursor_pos: js_idx_to_char_idx(cursorPos, code),
        detail_level: 0,
      },
      onResults,
    );
  }

  _requestIntrospection(method, requestType, content, onResults) {
    const state = { observer: onResults };
    const deliver = (message) => {
      try {
        state.observer?.(message, "shell");
      } catch (error) {
        log("WSKernel: introspection callback failed:", error);
      }
    };
    const kernel = this.session.kernel;
    const unavailable = this._requestError();
    if (unavailable) {
      deliver(_failedReply(requestType, unavailable));
      return;
    }
    const generation = this._generation;
    let request;
    try {
      const query = this._beginQuery(requestType);
      request = this._dispatchRequest(query, () => kernel[method](content));
    } catch (error) {
      deliver(_failedReply(requestType, error));
      return;
    }
    const settle = (message) => {
      untrack();
      deliver(message);
      state.observer = null;
    };
    const cancel = (reason) => settle(_failedReply(requestType, unavailableError(reason)));
    const untrack = this._trackRequest(cancel);
    Promise.resolve(request).then(settle, (error) => settle(_failedReply(requestType, error)));
    if (generation !== this._generation) cancel("The kernel connection changed.");
    return new Disposable(() => {
      state.observer = null;
      untrack();
    });
  }

  inputReply(input) {
    if (this._requestError()) return false;
    return this.session.kernel.sendInputReply({
      value: input,
    });
  }

  // Comms are delegated to @jupyterlab/services rather than reimplemented on
  // top of the iopub signal. KernelConnection dispatches comms *before* it
  // emits iopubMessage, awaits each comm handler inside its message loop (the
  // ordering the ZMQ registry builds by hand), clears its comms on restart,
  // rejects stale post-restart messages, and already delivers buffers as
  // DataView. Reimplementing would mean double-handling all of it. Two
  // divergences are deliberate and documented: JupyterLab closes an unclaimed
  // target's comm, which is not safe on a shared kernel, and it manages
  // subshell state this package does not use.

  registerCommTarget(targetName, handler) {
    const claim = { handler };
    this._commTargets.set(targetName, claim);
    this._attachCommTarget(targetName, claim);
    return new Disposable(() => {
      if (this._commTargets.get(targetName) !== claim) return;
      this._commTargets.delete(targetName);
      if (claim.kernel && claim.kernel === this._connection) {
        claim.kernel.removeCommTarget(targetName, claim.wrapped);
      }
    });
  }

  _attachCommTarget(targetName, claim) {
    const kernel = this._connection;
    if (!kernel) return;
    const wrapped = (jlComm, message) => {
      if (
        this._connection === kernel &&
        this._commTargets.get(targetName) === claim &&
        !this._requestError()
      ) {
        return claim.handler(this._wrapComm(jlComm), message);
      }
    };
    claim.kernel = kernel;
    claim.wrapped = wrapped;
    kernel.registerCommTarget(targetName, wrapped);
  }

  createComm(targetName, commId) {
    const error = this._requestError();
    if (error) throw error;
    return this._wrapComm(this.session.kernel.createComm(targetName, commId));
  }

  /**
   * Divert a request's output, through JupyterLab's own message hook. A hook
   * that returns false stops the message reaching the future, which is exactly
   * the redirect an Output widget wants — and the reply and the status still
   * arrive, so the cell finishes normally.
   */
  registerOutputRoute(msgId, handler) {
    const hook = (message) => {
      const msgType = message.header.msg_type;
      if (!OUTPUT_TYPES.includes(msgType) && msgType !== "clear_output") {
        return true;
      }
      try {
        handler(message);
      } catch (error) {
        log("WSKernel: output route handler failed:", error);
      }
      return false;
    };
    const kernel = this.session.kernel;
    kernel?.registerMessageHook(msgId, hook);
    return new Disposable(() => kernel?.removeMessageHook(msgId, hook));
  }

  getComm(commId) {
    return this._commWrappers.get(commId);
  }

  async requestCommInfo(targetName) {
    const kernel = this.session.kernel;
    const error = this._requestError();
    if (error) throw error;
    const result = Promise.withResolvers();
    const untrack = this._trackRequest((reason) => result.reject(unavailableError(reason)));
    try {
      Promise.resolve(kernel.requestCommInfo(targetName ? { target_name: targetName } : {})).then(
        result.resolve,
        result.reject,
      );
    } catch (requestError) {
      result.reject(requestError);
    }
    try {
      const reply = await result.promise;
      return reply.content?.status === "ok" ? reply.content.comms : {};
    } finally {
      untrack();
    }
  }

  /**
   * Present a JupyterLab comm as the IClassicComm ipywidgets expects.
   * JupyterLab's send methods return a shell future; ipywidgets wants the
   * request id, synchronously.
   */
  _wrapComm(jlComm) {
    const existing = this._commWrappers.get(jlComm.commId);
    if (existing) {
      return existing;
    }

    const idOf = (future) => future?.msg?.header?.msg_id ?? "";
    const comm = new Comm(jlComm.commId, jlComm.targetName, {
      send: (msgType, content, metadata, buffers) => {
        switch (msgType) {
          case "comm_open":
            return idOf(jlComm.open(content.data, metadata, buffers));
          case "comm_msg":
            return idOf(jlComm.send(content.data, metadata, buffers));
          case "comm_close":
            return idOf(jlComm.close(content.data, metadata, buffers));
          default:
            log("WSKernel: unknown comm message type:", msgType);
            return "";
        }
      },
      unregister: (commId) => {
        if (this._commWrappers.get(commId) === comm) this._commWrappers.delete(commId);
      },
    });

    jlComm.onMsg = (message) => {
      if (this._commWrappers.get(jlComm.commId) === comm) return comm._handleMsg(message);
    };
    jlComm.onClose = (message) => {
      if (this._commWrappers.get(jlComm.commId) !== comm) return;
      this._commWrappers.delete(jlComm.commId);
      return comm._handleClose(message);
    };

    this._commWrappers.set(jlComm.commId, comm);
    return comm;
  }

  _retireConnection(reason) {
    if (this._connectionRetired) return;
    this._connectionRetired = true;
    this._generation++;
    this._queryRequests.clear();
    const pending = this._pendingRequests;
    this._pendingRequests = new Set();
    for (const cancel of pending) cancel(reason);
    const comms = [...this._commWrappers.values()];
    this._commWrappers.clear();
    for (const comm of comms) {
      comm._closed = true;
      try {
        comm._handleClose({ content: { comm_id: comm.comm_id, data: {} }, reason });
      } catch (error) {
        log("WSKernel: comm close handler failed during reset:", error);
      }
    }
    this.emitDidResetComms(reason);
  }

  _loseKernel(reason, { detach = false } = {}) {
    if (this._destroyed || this._closing || (this._lost && !detach)) {
      return;
    }
    if (!this._lost) {
      this._lost = true;
      this._restart?.controller.abort(new Error(reason));
      this.setLifecycle("dead");
      this.setExecutionState("dead");
      this._retireConnection(reason);
    }
    this.emitDidLoseKernel(reason, detach ? { detach: true } : undefined);
    if (detach) this.destroy();
  }

  rename(name) {
    return this.session.setPath(name);
  }

  destroy() {
    if (this._destroyed) return;
    log("WSKernel: destroying jupyter-js-services Session");
    this._destroyed = true;
    this._restart?.controller.abort(new Error("Kernel connection closed"));
    // Before super.destroy() disposes the emitter these would be announced on.
    this._retireConnection("Kernel shut down");
    this._closeSession();
    this._commTargets.clear();
    // Dispose managers to stop polling
    if (this._sessionManager) {
      this._sessionManager.dispose();
      this._sessionManager = null;
    }
    if (this._kernelManager) {
      this._kernelManager.dispose();
      this._kernelManager = null;
    }
    super.destroy();
  }
}

module.exports = WSKernel;
