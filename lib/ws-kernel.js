const { Disposable } = require("lumine");
const { randomUUID } = require("node:crypto");

const KernelTransport = require("./kernel-transport");
const InputView = require("./input-view");
const { Comm } = require("./comm");
const { OUTPUT_TYPES } = require("./output-utils");
const { log, js_idx_to_char_idx } = require("./utils");

// A kernel whose connection is gone for good, as JupyterLab reports it. Every
// comm on it is worthless, and no reply will ever arrive for anything in flight.
const DEAD_STATUSES = new Set(["dead"]);
// A kernel that is coming back with a fresh process. The comms do not survive it.
const RESET_STATUSES = new Set(["restarting", "autorestarting"]);

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
      ename: "NoReplyError",
      evalue: error?.message || "The kernel never answered this request.",
      traceback: [],
    },
  };
}

class WSKernel extends KernelTransport {
  supportsComms = true;

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
    this.session = session;
    this.gatewayName = gatewayName;
    // Store managers so we can dispose them on destroy
    this._sessionManager = managers.sessionManager;
    this._kernelManager = managers.kernelManager;
    // One Comm wrapper per JupyterLab comm, so getComm and repeated lookups
    // agree on object identity the way the ZMQ registry does.
    this._commWrappers = new Map();

    // JupyterLab services: kernel status is on session.kernel.status, and it
    // is already kernel-wide — the gateway reports every client's busy/idle.
    const getStatus = () => this.session.kernel?.status || "unknown";

    this.session.kernel?.statusChanged?.connect(() => {
      const status = getStatus();
      if (RESET_STATUSES.has(status)) {
        // The process is being replaced. Drop the wrappers and tell whoever
        // mirrors kernel state; the ZMQ side reaches this through _clearState.
        this._resetComms(`Kernel ${status}`);
      } else if (DEAD_STATUSES.has(status)) {
        // Nothing will ever answer again. Until now this transport emitted no
        // did-lose-kernel at all, so the facade's subscription was dead for
        // every remote kernel: an execution outstanding when the gateway went
        // away hung forever, and a widget kept moving while changing nothing.
        this._loseKernel("The kernel died");
      }
      this.setExecutionState(status);
    });
    this.setExecutionState(getStatus()); // Set initial status correctly

    // A websocket that will not come back is the remote equivalent of the
    // local process exiting.
    this.session.kernel?.connectionStatusChanged?.connect((_sender, status) => {
      if (status === "disconnected") {
        this._loseKernel("The connection to the kernel was lost");
      }
    });

    // The count and the per-cell timer follow the kernel too: iopubMessage
    // carries every client's traffic, where our own requestExecute futures
    // would only ever show this editor's cells.
    this.session.kernel?.iopubMessage?.connect((_sender, message) => {
      if (message.header.msg_type === "execute_input") {
        this.setExecutionCount(message.content.execution_count);
        this.setExecutionStartTime(Date.now());
        this.setLastExecutionTime("Running ...");
      }
    });

    this.session.kernel?.anyMessage?.connect((_sender, event) => {
      const message = event?.msg;
      if (
        event?.direction === "recv" &&
        message?.header?.msg_type === "kernel_info_reply" &&
        message.content?.language_info
      ) {
        this.setLanguageInfo(message.content.language_info);
      }
    });
    this.setLifecycle("ready");
  }

  interrupt() {
    this.session.kernel?.interrupt();
  }

  /**
   * The settle an execution's caller resolves on, for a session whose kernel
   * the server has culled: the error that says why, the reply, the idle. The
   * bare dereference used to throw inside `createResultAsync`'s executor —
   * an unhandled rejection, with the bubble left spinning forever.
   */
  _settleAgainstGoneKernel(onResults) {
    const parent_header = { msg_id: "execute_gone", msg_type: "execute_request" };
    onResults(
      {
        header: { msg_id: "execute_gone_error", msg_type: "error" },
        parent_header,
        content: {
          status: "error",
          ename: "KernelGone",
          evalue: "The session's kernel is gone.",
          traceback: [],
        },
      },
      "iopub",
    );
    onResults(
      {
        header: { msg_id: "execute_gone_reply", msg_type: "execute_reply" },
        parent_header,
        content: {
          status: "error",
          ename: "KernelGone",
          evalue: "The session's kernel is gone.",
          traceback: [],
        },
      },
      "shell",
    );
    onResults(
      {
        header: { msg_id: "execute_gone_idle", msg_type: "status" },
        parent_header,
        content: { execution_state: "idle" },
      },
      "iopub",
    );
  }

  async shutdown() {
    if (typeof this.session.shutdown === "function") {
      await this.session.shutdown();
    } else {
      await this.session.kernel?.shutdown?.();
    }
  }

  restart(onRestarted) {
    if (!this.session.kernel) {
      lumine.notifications.addError("Cannot restart: the session's kernel is gone", {
        dismissable: true,
      });
      return Promise.resolve(false);
    }
    const future = this.session.kernel.restart();
    return future
      .then(() => {
        this._lost = false;
        this.setLifecycle("ready");
        if (onRestarted) {
          onRestarted();
        }
        return true;
      })
      .catch((error) => {
        log("WSKernel: restart error:", error);
        lumine.notifications.addError("Failed to restart kernel", {
          detail: error.message,
          dismissable: true,
        });
        return false;
      });
  }

  execute(code, onResults) {
    this._execute(code, onResults, false);
  }

  executeWatch(code, onResults) {
    this._execute(code, onResults, true);
  }

  _execute(code, onResults, watch) {
    if (this._destroyed || this._lost || !this.session.kernel) {
      this._settleAgainstGoneKernel(onResults);
      return;
    }
    const state = { replySeen: false, idleSeen: false, settled: false };
    const deliver = (message, channel) => {
      try {
        onResults(message, channel);
      } catch (error) {
        log("WSKernel: execution callback failed:", error);
      }
    };
    let future;
    try {
      future = this.session.kernel.requestExecute({
        code,
        ...(watch ? { silent: false, store_history: false, allow_stdin: false } : {}),
      });
    } catch (error) {
      this._settleFailedExecution(deliver, state, `execute_failed_${randomUUID()}`, error, true);
      return;
    }
    const receive = (message, channel) => {
      if (state.settled) return;
      if (channel === "shell" && message.header.msg_type === "execute_reply")
        state.replySeen = true;
      if (message.header.msg_type === "status" && message.content.execution_state === "idle") {
        state.idleSeen = true;
      }
      deliver(message, channel);
      if (state.replySeen && state.idleSeen) state.settled = true;
    };
    future.onIOPub = (message) => receive(message, "iopub");
    future.onReply = (message) => receive(message, "shell");
    future.onStdin = (message) => receive(message, "stdin");
    // A remote restart disposes the future without another protocol message.
    // Settle only the missing halves, preserving any real outcome already seen.
    future.done?.then(
      () => {},
      (error) =>
        this._settleFailedExecution(
          deliver,
          state,
          future.msg?.header?.msg_id || `execute_failed_${randomUUID()}`,
          error,
        ),
    );
  }

  _settleFailedExecution(deliver, state, requestId, error, notSent = false) {
    if (state.settled) return;
    state.settled = true;
    const parent_header = { msg_id: requestId, msg_type: "execute_request" };
    const content = {
      status: "error",
      ename: notSent ? "SendError" : "ExecutionOutcomeUnknown",
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
    this._requestIntrospection(
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
    this._requestIntrospection(
      "requestInspect",
      "inspect_request",
      {
        code,
        cursor_pos: cursorPos,
        detail_level: 0,
      },
      onResults,
    );
  }

  _requestIntrospection(method, requestType, content, onResults) {
    const deliver = (message) => {
      try {
        onResults(message, "shell");
      } catch (error) {
        log("WSKernel: introspection callback failed:", error);
      }
    };
    const kernel = this.session.kernel;
    if (this._destroyed || this._lost || !kernel) {
      deliver(_failedReply(requestType, new Error("The session's kernel is gone.")));
      return;
    }
    let request;
    try {
      request = kernel[method](content);
    } catch (error) {
      deliver(_failedReply(requestType, error));
      return;
    }
    // A consumer exception is isolated from a kernel request rejection; it
    // must neither become an unhandled rejection nor fabricate a second reply.
    Promise.resolve(request).then(deliver, (error) => deliver(_failedReply(requestType, error)));
  }

  inputReply(input) {
    this.session.kernel?.sendInputReply({
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
    const wrapped = (jlComm, message) => handler(this._wrapComm(jlComm), message);
    this.session.kernel?.registerCommTarget(targetName, wrapped);
    return new Disposable(() => this.session.kernel?.removeCommTarget(targetName, wrapped));
  }

  createComm(targetName, commId) {
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
    this.session.kernel?.registerMessageHook(msgId, hook);
    return new Disposable(() => this.session.kernel?.removeMessageHook(msgId, hook));
  }

  getComm(commId) {
    return this._commWrappers.get(commId);
  }

  async requestCommInfo(targetName) {
    const reply = await this.session.kernel.requestCommInfo(
      targetName ? { target_name: targetName } : {},
    );
    return reply.content?.status === "ok" ? reply.content.comms : {};
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
      unregister: (commId) => this._commWrappers.delete(commId),
    });

    jlComm.onMsg = (message) => comm._handleMsg(message);
    jlComm.onClose = (message) => {
      this._commWrappers.delete(jlComm.commId);
      return comm._handleClose(message);
    };

    this._commWrappers.set(jlComm.commId, comm);
    return comm;
  }

  /** Drop every comm wrapper and announce it, as _clearState does on ZMQ. */
  _resetComms(reason) {
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

  /** Announce, once, that this connection is gone for good. */
  _loseKernel(reason) {
    if (this._lost || this._destroyed) {
      return;
    }
    this._lost = true;
    this.setLifecycle("dead");
    this._resetComms(reason);
    this.emitDidLoseKernel(reason);
  }

  promptRename() {
    const view = new InputView(
      {
        prompt: "Name your current session",
        defaultText: this.session.path,
        allowCancel: true,
      },
      (input) => this.session.setPath(input),
    );
    view.attach();
  }

  destroy() {
    log("WSKernel: destroying jupyter-js-services Session");
    this._destroyed = true;
    // Before super.destroy() disposes the emitter these would be announced on.
    this._resetComms("Kernel shut down");
    this.session.dispose();
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
