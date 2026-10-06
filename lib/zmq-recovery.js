const { randomUUID } = require("node:crypto");
const { Message, Socket } = require("./jmp");
const { log } = require("./utils");

/**
 * Own the recovery policy for one local transport: acknowledgement watchdog,
 * bounded fresh-connection probes, the recovery barrier and quarantine. The
 * request ledger stays with the shell coordinator and physical probe cleanup
 * stays with the connection generation owner. Code is never replayed.
 */
class ZMQRecovery {
  _current = null;
  closePromise = Promise.resolve();
  quarantinedRequestIds = new Set();
  notification = null;
  watchdogTimer = null;
  revision = 0;
  _watchdogToken = null;
  _completionToken = null;
  _notificationPublication = null;

  constructor(transport) {
    this.transport = transport;
  }

  get current() {
    return this._current;
  }

  set current(recovery) {
    if (this._current === recovery) return;
    this._current = recovery;
    this.revision++;
    this._completionToken = null;
  }

  _isActive(recovery, epoch) {
    return (
      this.current === recovery &&
      epoch === this.transport._connectionGeneration &&
      !this.transport._destroyed &&
      !this.transport._shutdownPromise &&
      this.transport.lifecycle === "recovering"
    );
  }

  _canReceiveProbe(recovery, epoch) {
    return (
      this.current === recovery &&
      epoch === this.transport._connectionGeneration &&
      !this.transport._destroyed &&
      !this.transport._shutdownPromise &&
      (this.transport.lifecycle === "recovering" || this.transport.lifecycle === "unresponsive")
    );
  }

  dismissNotification() {
    const notification = this.notification;
    this.notification = null;
    this._notificationPublication = null;
    notification?.dismiss?.();
  }

  startWatchdog() {
    this.transport._stopAckWatchdog();
    const token = {};
    const epoch = this.transport._connectionGeneration;
    this._watchdogToken = token;
    this.watchdogTimer = setInterval(() => {
      if (this._watchdogToken !== token || epoch !== this.transport._connectionGeneration) return;
      if (
        this.transport._destroyed ||
        this.transport._shutdownPromise ||
        (this.transport.lifecycle !== "ready" && this.transport.lifecycle !== "recovering")
      ) {
        return;
      }
      let kernelIdle = this.transport._reportedExecutionState === "idle";
      const now = Date.now();
      const recovery = this.current;
      const revision = this.revision;
      const isCurrentRecoveryTick = () =>
        this._watchdogToken === token &&
        epoch === this.transport._connectionGeneration &&
        this.revision === revision &&
        this.current === recovery &&
        !this.transport._destroyed &&
        !this.transport._shutdownPromise &&
        this.transport.lifecycle === "recovering";
      if (this.transport.lifecycle === "recovering" && recovery) {
        let busyProbe = recovery.probes.find(
          (probe) => probe.id === this.transport._reportedStatusParent,
        );
        if (recovery.targetProgress) {
          this.transport._maybeFinishRecovery();
          if (!isCurrentRecoveryTick()) return;
          kernelIdle = this.transport._reportedExecutionState === "idle";
          busyProbe = recovery.probes.find(
            (probe) => probe.id === this.transport._reportedStatusParent,
          );
          if (!this.transport.executionCallbacks[recovery.targetId]) {
            if (!kernelIdle) {
              recovery.barrierIdleSince = null;
              if (
                busyProbe?.busyAt &&
                now - busyProbe.busyAt >= this.transport.constructor.RECOVERY_RETRY_MS
              ) {
                this.transport._quarantineBarrier(
                  "The execution completed, but its recovery probe stopped before replying.",
                );
              }
            } else {
              recovery.barrierIdleSince ??= now;
              if (now - recovery.barrierIdleSince >= this.transport.constructor.RECOVERY_RETRY_MS) {
                this.transport._quarantineBarrier(
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
            if (
              busyProbe?.busyAt &&
              now - busyProbe.busyAt >= this.transport.constructor.RECOVERY_TIMEOUT_MS
            ) {
              this.transport._quarantine(
                recovery.targetId,
                "The recovery probe was acknowledged but never answered.",
              );
            }
            return;
          }
          if (recovery.idleSince == null) {
            recovery.idleSince = now;
            recovery.nextProbeAt = now + this.transport.constructor.RECOVERY_RETRY_MS;
          }
          if (
            recovery.attempts < this.transport.constructor.MAX_RECOVERY_PROBES &&
            recovery.nextProbeAt != null &&
            now >= recovery.nextProbeAt
          ) {
            this.transport._runRecoveryProbe();
            if (!isCurrentRecoveryTick()) return;
            kernelIdle = this.transport._reportedExecutionState === "idle";
            if (!kernelIdle) {
              recovery.idleSince = null;
              recovery.nextProbeAt = null;
              return;
            }
            recovery.nextProbeAt =
              recovery.attempts < this.transport.constructor.MAX_RECOVERY_PROBES
                ? now + this.transport.constructor.RECOVERY_RETRY_MS
                : null;
          }
          if (now - recovery.idleSince >= this.transport.constructor.RECOVERY_TIMEOUT_MS) {
            this.transport._quarantine(
              recovery.targetId,
              "The kernel did not acknowledge this request.",
            );
          }
          return;
        }
      }
      const requestId = this.transport._activeShellRequest;
      const callbackInfo = requestId ? this.transport.executionCallbacks[requestId] : null;
      if (!callbackInfo || callbackInfo.queued) return;

      const replyDone = callbackInfo.replySeen || callbackInfo.expectsReply === false;
      const idleDone = callbackInfo.idleSeen || callbackInfo.expectsIdle === false;

      if (replyDone && idleDone) {
        this.transport._finishShellRequest(requestId, callbackInfo);
        return;
      }

      // Once any real message arrives, the kernel demonstrably owns the
      // request. A long execution may then be silent indefinitely and must
      // never be mistaken for a lost request.
      if (!callbackInfo.acknowledged) {
        if (!kernelIdle) callbackInfo.idleSince = null;
        else callbackInfo.idleSince ??= now;
        if (
          this.transport.lifecycle === "ready" &&
          kernelIdle &&
          now - callbackInfo.idleSince >= this.transport.constructor.ACK_PROBE_AFTER_MS
        ) {
          this.transport._beginRecovery(requestId);
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
      if (now - quietSince <= this.transport.constructor.HALF_SETTLED_GRACE_MS) {
        return;
      }
      if (replyDone) {
        log("ZMQKernel: trailing idle never arrived, supplying it:", requestId);
        this.transport._settleTrailingIdle(requestId, callbackInfo);
      } else {
        this.transport._quarantine(
          requestId,
          "The kernel finished the request but its shell reply was lost.",
          { skipIdle: true },
        );
      }
    }, this.transport.constructor.ACK_POLL_INTERVAL_MS);
  }

  recordProgress(requestId, callbackInfo) {
    callbackInfo.acknowledged = true;
    callbackInfo.lastProgressAt = Date.now();
    const recovery = this.current;
    if (!recovery || recovery.targetId !== requestId || recovery.targetProgress) return;
    recovery.targetProgress = true;
    this.transport._maybeFinishRecovery();
  }

  begin(requestId) {
    if (this.current || this.transport.lifecycle !== "ready") return;
    const entry = this.transport.executionCallbacks[requestId];
    if (!entry || entry.acknowledged || entry.queued) return;

    log("ZMQKernel: shell request unacknowledged, recovering:", requestId);
    const recovery = {
      targetId: requestId,
      targetProgress: false,
      attempts: 0,
      probes: [],
      idleSince: Date.now(),
      nextProbeAt: Date.now() + this.transport.constructor.RECOVERY_RETRY_MS,
      barrierIdleSince: null,
    };
    const epoch = this.transport._connectionGeneration;
    this.current = recovery;
    this.transport.setLifecycle("recovering");
    if (!this._isActive(recovery, epoch)) {
      if (this.current === recovery) this.current = null;
      return;
    }
    this.transport.setExecutionState("recovering");
    if (!this._isActive(recovery, epoch)) {
      if (this.current === recovery) this.current = null;
      return;
    }
    this.transport._runRecoveryProbe();
    if (!this._isActive(recovery, epoch)) return;
    this.transport._cancelQueuedRequests(
      () => true,
      "ExecutionCancelled",
      "The request was not sent because the kernel connection entered recovery.",
    );
  }

  runProbe() {
    const recovery = this.current;
    const epoch = this.transport._connectionGeneration;
    if (
      !recovery ||
      !this._isActive(recovery, epoch) ||
      recovery.targetProgress ||
      recovery.attempts >= this.transport.constructor.MAX_RECOVERY_PROBES ||
      !this.transport.connection
    ) {
      return;
    }
    recovery.attempts++;

    const scheme = this.transport.connection.signature_scheme.slice("hmac-".length);
    const socket = this.transport._createRecoverySocket(scheme, this.transport.connection.key);
    const probeSession = randomUUID();
    const probeId = `recovery_probe_${this.transport._connectionGeneration}_${randomUUID()}`;
    socket.identity = `recovery${randomUUID()}`;
    const probe = {
      socket,
      id: probeId,
      session: probeSession,
      epoch,
      replySeen: false,
      idleSeen: false,
    };
    recovery.probes.push(probe);

    socket.on("message", (message) => {
      const current = this.current;
      if (
        current !== recovery ||
        probe.replySeen ||
        !this._canReceiveProbe(recovery, epoch) ||
        !current.probes.includes(probe) ||
        message?.header?.msg_type !== "kernel_info_reply" ||
        typeof message.header.msg_id !== "string" ||
        message.header.msg_id.length === 0 ||
        !message.content ||
        typeof message.content !== "object" ||
        Array.isArray(message.content) ||
        message?.parent_header?.msg_type !== "kernel_info_request" ||
        message?.parent_header?.msg_id !== probeId ||
        message?.parent_header?.session !== probeSession
      ) {
        return;
      }
      probe.replySeen = true;
      probe.closedPromise = this.transport
        ._connectionOwner()
        .retireSocket(probe.socket, false, true)
        .then(() => {
          probe.closed = true;
          if (!this._canReceiveProbe(recovery, epoch)) return;
          if (
            this.transport._reportedStatusParent === probe.id &&
            this.transport._reportedExecutionState === "busy"
          ) {
            this.transport._reportedExecutionState = "idle";
            this.transport._reportedIdleSince = Date.now();
          }
          if (
            this.current?.quarantined &&
            this.current.probes.every((candidate) => candidate.closed)
          ) {
            this.transport._clearRecovery();
            return;
          }
          this.transport._maybeFinishRecovery();
        });
    });
    const address = `${this.transport.connection.transport}://${this.transport.connection.ip}:${this.transport.connection.shell_port}`;
    socket.connect(address);
    const message = this.transport._createMessage("kernel_info_request", probeId);
    message.header.session = probeSession;
    socket.send(new Message(message)).catch((error) => {
      log("ZMQKernel: recovery probe send failed:", error);
    });
  }

  createProbeSocket(scheme, key) {
    return new Socket("dealer", scheme, key, { monitor: false, linger: 0 });
  }

  handleProbeIO(message) {
    const probe = this.current?.probes.find(
      (candidate) =>
        message?.parent_header?.msg_id === candidate.id &&
        message?.parent_header?.session === candidate.session,
    );
    if (!probe || (probe.epoch != null && !this._canReceiveProbe(this.current, probe.epoch))) {
      return false;
    }
    if (message.header?.msg_type === "status" && message.content?.execution_state === "idle") {
      probe.idleSeen = true;
      this.transport._maybeFinishRecovery();
    } else if (
      message.header?.msg_type === "status" &&
      message.content?.execution_state === "busy"
    ) {
      probe.busyAt ??= Date.now();
    }
    return true;
  }

  maybeFinish() {
    const recovery = this.current;
    if (!recovery || !recovery.targetProgress) return;
    const targetDone = !this.transport.executionCallbacks[recovery.targetId];
    const probesDone =
      recovery.probes.length > 0 &&
      recovery.probes.every((probe) => probe.replySeen && probe.idleSeen && probe.closed);
    if (!targetDone || !probesDone) {
      return;
    }

    this.transport._completeRecovery(recovery);
  }

  complete(recovery) {
    if (this.current !== recovery) return;
    log("ZMQKernel: shell connection recovered:", recovery.targetId);
    const epoch = this.transport._connectionGeneration;
    const closed = this.transport._clearRecovery();
    if (this.current && this.current !== recovery) return Promise.resolve(closed);
    // Capture after clear invalidates older completions, so this continuation
    // belongs to that exact cleanup and cannot unlock a later recovery round.
    const token = { revision: this.revision, epoch, current: this.current };
    this._completionToken = token;
    const isCurrentCompletion = () =>
      this._completionToken === token &&
      this.revision === token.revision &&
      this.current === token.current &&
      epoch === this.transport._connectionGeneration &&
      !this.transport._destroyed &&
      !this.transport._shutdownPromise;
    return Promise.resolve(closed).then(() => {
      try {
        if (!isCurrentCompletion() || this.transport.lifecycle !== "recovering") return;
        this.transport.setLifecycle("ready");
        if (!isCurrentCompletion() || this.transport.lifecycle !== "ready") return;
        if (this.transport.executionState === "recovering") {
          this.transport.setExecutionState(this.transport._reportedExecutionState || "idle");
          if (!isCurrentCompletion() || this.transport.lifecycle !== "ready") return;
        }
        this.transport._drainShellQueue();
      } finally {
        if (this._completionToken === token) this._completionToken = null;
      }
    });
  }

  closeProbes(forUnload = false) {
    const probes = this.current?.probes || [];
    if (this.current) this.current.probes = [];
    return Promise.all(
      probes.map((probe) => {
        try {
          probe.socket.removeAllListeners();
          return this.transport._connectionOwner().retireSocket(probe.socket, forUnload, true);
        } catch (error) {
          log("ZMQKernel: recovery probe close failed:", error);
          return Promise.resolve();
        }
      }),
    );
  }

  clear(forUnload = false) {
    this.revision++;
    this._completionToken = null;
    const recovery = this.current;
    if (!recovery) return this.closePromise || Promise.resolve();
    const closed = this.transport._closeRecoveryProbes(forUnload);
    if (this.current === recovery) this.current = null;
    const previous = this.closePromise || Promise.resolve();
    this.closePromise = Promise.all([previous, closed]).then(() => {});
    return this.closePromise;
  }

  quarantine(requestId, reason, options = {}) {
    if (this.transport.lifecycle === "unresponsive" || this.transport._destroyed) return;
    const epoch = this.transport._connectionGeneration;
    const recovery = this.current;
    const revision = this.revision;
    const shutdown = this.transport._shutdownPromise;
    const entry = requestId ? this.transport.executionCallbacks[requestId] : null;
    const isCurrentQuarantine = () =>
      epoch === this.transport._connectionGeneration &&
      this.current === recovery &&
      this.revision === revision &&
      !this.transport._destroyed &&
      this.transport._shutdownPromise === shutdown &&
      this.transport.lifecycle === "unresponsive";
    log("ZMQKernel: quarantining unresponsive shell connection:", requestId, reason);
    if (this.current) this.current.quarantined = true;
    this.transport.setLifecycle("unresponsive");
    if (!isCurrentQuarantine()) return;
    this.transport.setExecutionState("unresponsive");
    if (!isCurrentQuarantine()) return;
    this.transport._cancelQueuedRequests(
      () => true,
      "ExecutionCancelled",
      "The request was not sent because the kernel connection is quarantined.",
    );
    if (!isCurrentQuarantine()) return;

    if (entry && this.transport.executionCallbacks[requestId] === entry) {
      delete this.transport.executionCallbacks[requestId];
      this.quarantinedRequestIds.add(requestId);
      if (this.transport._activeShellRequest === requestId)
        this.transport._activeShellRequest = null;
      const execute = entry.requestType === "execute_request";
      this.transport._settlePending(
        requestId,
        entry,
        execute ? "ExecutionOutcomeUnknown" : "KernelUnresponsive",
        execute
          ? `${reason} It may still execute; restart the kernel before continuing.`
          : `${reason} Restart the kernel before continuing.`,
        { ...options, updateStatus: false },
      );
    }
    if (isCurrentQuarantine() && !shutdown) {
      this.transport._showUnresponsiveNotification(reason, true);
    }
  }

  quarantineBarrier(reason) {
    if (this.transport.lifecycle === "unresponsive" || this.transport._destroyed) return;
    const epoch = this.transport._connectionGeneration;
    const recovery = this.current;
    const revision = this.revision;
    const shutdown = this.transport._shutdownPromise;
    const isCurrentQuarantine = () =>
      epoch === this.transport._connectionGeneration &&
      this.current === recovery &&
      this.revision === revision &&
      !this.transport._destroyed &&
      this.transport._shutdownPromise === shutdown &&
      this.transport.lifecycle === "unresponsive";
    if (this.current) this.current.quarantined = true;
    this.transport.setLifecycle("unresponsive");
    if (!isCurrentQuarantine()) return;
    this.transport.setExecutionState("unresponsive");
    if (isCurrentQuarantine() && !shutdown) {
      this.transport._showUnresponsiveNotification(reason, false);
    }
  }

  showNotification(reason, outcomeUnknown = true) {
    if (this.notification) return;
    const publication = {
      epoch: this.transport._connectionGeneration,
      revision: this.revision,
      current: this.current,
      lifecycle: this.transport.lifecycle,
    };
    const pending = this._notificationPublication;
    if (
      pending?.epoch === publication.epoch &&
      pending.revision === publication.revision &&
      pending.current === publication.current
    ) {
      return;
    }
    this._notificationPublication = publication;
    const findKernel = () =>
      require("./store").runningKernels.find((kernel) => kernel.transport === this.transport);
    try {
      const notification = lumine.notifications.addError(
        `${this.transport.displayName}: kernel connection is unresponsive`,
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
      if (
        this._notificationPublication === publication &&
        publication.epoch === this.transport._connectionGeneration &&
        publication.revision === this.revision &&
        publication.current === this.current &&
        publication.lifecycle === this.transport.lifecycle &&
        !this.transport._destroyed &&
        !this.transport._shutdownPromise
      ) {
        this.notification = notification;
      } else {
        notification?.dismiss?.();
      }
    } finally {
      if (this._notificationPublication === publication) this._notificationPublication = null;
    }
  }

  stopWatchdog() {
    this._watchdogToken = null;
    if (this.watchdogTimer != null) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }
}

module.exports = ZMQRecovery;
