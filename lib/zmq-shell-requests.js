const { Message } = require("./jmp");
const { log } = require("./utils");

/**
 * Own the shell request ledger and queue for one ZMQ transport. The transport
 * owns sockets, connection generations and recovery; this coordinator owns
 * when a request may be sent, which terminal halves remain, and settlement.
 */
class ShellRequestCoordinator {
  callbacks = {};
  queue = [];
  activeRequest = null;
  drainScheduled = false;

  constructor(transport) {
    this.transport = transport;
  }

  /** Replace the entire ledger before teardown callbacks can reenter it. */
  takePending() {
    const pending = Object.entries(this.callbacks);
    this.callbacks = {};
    this.queue = [];
    this.activeRequest = null;
    return pending;
  }

  send(message, requestId, onResults, suppressStatus = false, options = {}) {
    this.transport._ensureRequestState();
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
      generation: this.transport._connectionGeneration,
    };
    this.callbacks[requestId] = entry;

    if (!this.transport.shellSocket) {
      this.settleUnanswered(requestId, requestType, "KernelGone", "The kernel is shutting down.");
      return requestId;
    }
    if (this.transport.lifecycle === "recovering" || this.transport.lifecycle === "unresponsive") {
      this.settleUnanswered(
        requestId,
        requestType,
        "KernelUnresponsive",
        this.transport.lifecycle === "recovering"
          ? "The kernel connection is being recovered; this request was not sent."
          : "The kernel connection is quarantined. Restart the kernel before continuing.",
        { updateStatus: false },
      );
      return requestId;
    }
    if (this.transport.lifecycle !== "ready") {
      this.settleUnanswered(
        requestId,
        requestType,
        "ExecutionCancelled",
        `The kernel is ${this.transport.lifecycle}; this request was not sent.`,
        { updateStatus: false },
      );
      return requestId;
    }

    // Completion and inspection answers are useful only for the newest cursor
    // state. Supersede queued copies before they can become stale on the wire.
    if (requestType === "complete_request" || requestType === "inspect_request") {
      this.cancelQueued(
        (queued) => queued.requestType === requestType,
        "ExecutionCancelled",
        "A newer introspection request superseded this one before it was sent.",
      );
    } else if (requestType === "execute_request" && !suppressStatus) {
      // A user run outranks stale editor assistance. The active introspection
      // is allowed to finish; every queued one is known not to have run.
      this.cancelQueued(
        (queued) =>
          queued.requestType === "complete_request" || queued.requestType === "inspect_request",
        "ExecutionCancelled",
        "The pending introspection request was cancelled by code execution.",
      );
      if (this.transport.executionState !== "busy") this.transport.setExecutionState("queued");
    }

    this.queue.push(requestId);
    this.drain();
    return requestId;
  }

  /** Startup probes precede the ordinary ready-state queue. */
  sendDirect(message, requestId, onResults, suppressStatus = false, options = {}) {
    this.transport._ensureRequestState();
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
      idleSince: this.transport._reportedExecutionState === "idle" ? now : null,
      queued: false,
      direct: true,
      generation: this.transport._connectionGeneration,
    };
    this.callbacks[requestId] = entry;
    const generation = this.transport._connectionGeneration;
    this.transport.shellSocket
      ?.send(
        new Message(message),
        () => generation !== this.transport._connectionGeneration || !this.callbacks[requestId],
      )
      .catch((error) => {
        if (generation !== this.transport._connectionGeneration) return;
        this.settleUnanswered(
          requestId,
          entry.requestType,
          "SendError",
          error.message || "Failed to send message to kernel",
          { updateStatus: false },
        );
      });
    return requestId;
  }

  cancelQueued(predicate, ename, evalue) {
    this.transport._ensureRequestState();
    const queued = this.queue;
    // Replace before callbacks run so a reentrant request is appended to the
    // live queue rather than overwritten when this sweep finishes.
    this.queue = [];
    for (const requestId of queued) {
      const entry = this.callbacks[requestId];
      if (!entry || !predicate(entry)) {
        if (entry) this.queue.push(requestId);
        continue;
      }
      delete this.callbacks[requestId];
      this.settlePending(requestId, entry, ename, evalue, { updateStatus: false });
    }
  }

  cancelQueuedRequest(requestId) {
    const entry = this.callbacks[requestId];
    if (!entry?.queued) return false;
    delete this.callbacks[requestId];
    this.queue = this.queue.filter((id) => id !== requestId);
    entry.callback = () => {};
    const userPending = Object.values(this.callbacks).some(
      (record) => record.requestType === "execute_request" && !record.suppressStatus,
    );
    if (this.transport.executionState === "queued" && !userPending) {
      const reported = this.callbacks[this.transport._reportedStatusParent];
      this.transport.setExecutionState(
        reported?.suppressStatus ? "idle" : this.transport._reportedExecutionState || "idle",
      );
    }
    this.scheduleDrain();
    return true;
  }

  observation(requestId) {
    return {
      cancelQueued: () => this.cancelQueuedRequest(requestId),
      dispose: () => {
        if (this.cancelQueuedRequest(requestId)) return;
        const entry = this.callbacks[requestId];
        // Keep the protocol ledger until reply and idle, while releasing the
        // caller and all of its closures immediately.
        if (entry) entry.callback = () => {};
      },
    };
  }

  drain() {
    this.transport._ensureRequestState();
    if (
      this.transport._destroyed ||
      this.activeRequest ||
      this.transport.lifecycle !== "ready" ||
      !this.transport.shellSocket
    ) {
      return;
    }
    let requestId = null;
    let entry = null;
    while (this.queue.length > 0 && !entry) {
      requestId = this.queue.shift();
      entry = this.callbacks[requestId];
    }
    if (!entry) return;

    entry.queued = false;
    entry.sentAt = Date.now();
    entry.lastProgressAt = entry.sentAt;
    entry.idleSince = this.transport._reportedExecutionState === "idle" ? entry.sentAt : null;
    entry.generation = this.transport._connectionGeneration;
    this.activeRequest = requestId;
    if (
      entry.requestType === "execute_request" &&
      !entry.suppressStatus &&
      this.transport.executionState !== "busy" &&
      this.transport.executionState !== "queued"
    ) {
      this.transport.setExecutionState("queued");
    }
    const generation = this.transport._connectionGeneration;
    this.transport.shellSocket
      .send(
        new Message(entry.message),
        () =>
          generation !== this.transport._connectionGeneration ||
          this.activeRequest !== requestId ||
          !this.callbacks[requestId],
      )
      .catch((error) => {
        if (generation !== this.transport._connectionGeneration) return;
        log("ZMQKernel: Error sending shell message:", error);
        this.settleUnanswered(
          requestId,
          entry.requestType,
          "SendError",
          error.message || "Failed to send message to kernel",
        );
      });
  }

  scheduleDrain() {
    this.transport._ensureRequestState();
    if (this.drainScheduled) return;
    this.drainScheduled = true;
    queueMicrotask(() => {
      this.drainScheduled = false;
      this.drain();
    });
  }

  settleUnanswered(requestId, requestType, ename, evalue, options = {}) {
    this.transport._ensureRequestState();
    const callbackInfo = this.callbacks[requestId];
    if (!callbackInfo) {
      return;
    }
    delete this.callbacks[requestId];
    this.queue = this.queue.filter((queuedId) => queuedId !== requestId);
    if (this.activeRequest === requestId) this.activeRequest = null;
    this.settlePending(requestId, callbackInfo, ename, evalue, {
      requestType,
      ...options,
    });
    this.transport._maybeFinishRecovery();
    this.scheduleDrain();
  }

  finish(requestId, callbackInfo) {
    this.transport._ensureRequestState();
    if (this.callbacks[requestId] !== callbackInfo) return;
    delete this.callbacks[requestId];
    if (this.activeRequest === requestId) this.activeRequest = null;
    this.transport._maybeFinishRecovery();
    this.scheduleDrain();
  }

  /**
   * The synthesis half of settleUnanswered, operating on an entry the
   * caller already holds. Split out because a caller that has taken the whole
   * table at once cannot look entries up any more — see takePending.
   */
  settlePending(requestId, callbackInfo, ename, evalue, options = {}) {
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
      this.transport._reportedExecutionState === "idle"
    ) {
      this.transport.setExecutionState("idle");
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
  retire(msgId, callbackInfo) {
    const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
    const idleDone = callbackInfo.idleSeen || callbackInfo.expectsIdle === false;
    if (replyDone && idleDone) {
      this.finish(msgId, callbackInfo);
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
  settleTrailingIdle(requestId, callbackInfo) {
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
    if (
      this.transport._reportedStatusParent === requestId &&
      this.transport._reportedExecutionState !== "idle"
    ) {
      this.transport._reportedExecutionState = "idle";
      this.transport._reportedIdleSince = Date.now();
    }
    if (!callbackInfo.suppressStatus && this.transport._reportedExecutionState === "idle") {
      this.transport.setExecutionState("idle");
    }
    this.finish(requestId, callbackInfo);
  }
}

module.exports = ShellRequestCoordinator;
