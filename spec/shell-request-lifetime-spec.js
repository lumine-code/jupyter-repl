const ZMQKernel = require("../lib/zmq-kernel");

// A callback entry is retired once the kernel has said everything it will say
// about its request: the shell reply and the trailing iopub idle, in either
// order. Every request type now retires that way. Retiring a one-shot reply on
// the spot — as this used to — dropped the entry before the trailing idle, and
// the entry is what says a request's status is not a cell's, so every
// completion dragged the status bar behind it.
//
// `expectsReply: false` is the second lifetime: a comm message is acknowledged
// only by the busy/idle pair, so its trailing idle retires it on its own, and
// it settles silently because there is no caller waiting.
//
// The third is a request the kernel half-answered. One of the two frames can
// simply be lost, and an entry waiting on the other is stranded for the life of
// the connection — holding, if it was a watch, every watch pane in the window.
// `halfSettledAt` is when the first of the two arrived; the watchdog makes the
// missing one good once the grace period is up.

function fakeSocket() {
  return {
    sent: [],
    closed: false,
    // The real socket evaluates `isStale` on a later microtask, when the
    // send's turn in the chain comes up — which is the whole reason a request
    // sent immediately before a teardown can be dropped.
    async send(message, isStale = null) {
      await Promise.resolve();
      if (isStale?.()) {
        return;
      }
      this.sent.push(message);
    },
    removeAllListeners() {},
    close() {
      this.closed = true;
    },
  };
}

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.sessionId = "our-session";
  kernel.executionCallbacks = {};
  kernel._readyProbeIds = new Set();
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel._reportedExecutionState = "idle";
  kernel._reportedIdleSince = Date.now();
  kernel.states = [];
  kernel.seen = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  kernel.setExecutionCount = () => {};
  kernel.setExecutionStartTime = () => {};
  kernel.setLastExecutionTime = () => {};
  kernel.shellSocket = fakeSocket();
  return kernel;
}

/** The busy/idle pair the kernel publishes around any shell message. */
function statusMessage(requestId, state, requestType = "comm_msg") {
  return {
    header: { msg_id: `status_${requestId}_${state}`, msg_type: "status" },
    parent_header: { session: "our-session", msg_id: requestId, msg_type: requestType },
    content: { execution_state: state },
  };
}

function replyMessage(requestId, requestType = "execute_request", content = { status: "ok" }) {
  return {
    header: {
      msg_id: `reply_${requestId}`,
      msg_type: requestType.replace(/_request$/, "_reply"),
    },
    parent_header: { session: "our-session", msg_id: requestId, msg_type: requestType },
    content,
  };
}

/**
 * A callback entry as `_sendShellMessage` would arm it, with the fields a
 * particular case wants to backdate or pre-satisfy overridden.
 */
function armedEntry(kernel, requestId, overrides = {}) {
  const now = Date.now();
  kernel.executionCallbacks[requestId] = {
    callback: (message, channel) => kernel.seen.push([message.header.msg_type, channel]),
    suppressStatus: false,
    requestType: "execute_request",
    expectsReply: true,
    expectsIdle: true,
    replySeen: false,
    idleSeen: false,
    halfSettledAt: null,
    lastProgressAt: now,
    armedAt: now,
    ...overrides,
  };
  return kernel.executionCallbacks[requestId];
}

describe("shell request lifetimes", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
  });

  describe("a request that expects a reply", () => {
    it("is retired only once both the reply and the idle have arrived", async () => {
      await kernel._sendShellMessage(
        kernel._createMessage("execute_request", "execute_1"),
        "execute_1",
        () => {},
      );

      kernel.onIOMessage(statusMessage("execute_1", "idle", "execute_request"));
      expect(Object.keys(kernel.executionCallbacks)).toEqual(["execute_1"]);

      kernel.onShellMessage(replyMessage("execute_1"));
      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });
  });

  describe("a request that expects no reply", () => {
    it("is retired by the trailing idle alone", async () => {
      await kernel._sendShellMessage(
        kernel._createMessage("comm_msg", "comm_1"),
        "comm_1",
        () => {},
        true,
        { expectsReply: false },
      );

      expect(Object.keys(kernel.executionCallbacks)).toEqual(["comm_1"]);

      kernel.onIOMessage(statusMessage("comm_1", "busy"));
      kernel.onIOMessage(statusMessage("comm_1", "idle"));

      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });

    it("strands nothing across a burst of sends", async () => {
      // The shape of a dragged slider: one comm message per frame, each
      // acknowledged by a busy/idle pair and none of them ever replied to.
      for (let i = 0; i < 100; i++) {
        const requestId = `comm_${i}`;
        await kernel._sendShellMessage(
          kernel._createMessage("comm_msg", requestId),
          requestId,
          () => {},
          true,
          { expectsReply: false },
        );
        kernel.onIOMessage(statusMessage(requestId, "busy"));
        kernel.onIOMessage(statusMessage(requestId, "idle"));
      }

      expect(Object.keys(kernel.executionCallbacks).length).toBe(0);
      expect(kernel.shellSocket.sent.length).toBe(100);
    });

    it("moves the status bar for none of them", async () => {
      // Left visible, every frame of a drag would flash the status bar busy —
      // and the unsuppressed idle would fire every watch and the variable
      // explorer along with it.
      for (let i = 0; i < 10; i++) {
        const requestId = `comm_${i}`;
        await kernel._sendShellMessage(
          kernel._createMessage("comm_msg", requestId),
          requestId,
          () => {},
          true,
          { expectsReply: false },
        );
        kernel.onIOMessage(statusMessage(requestId, "busy"));
        kernel.onIOMessage(statusMessage(requestId, "idle"));
      }

      expect(kernel.states).toEqual([]);
    });

    it("is reclaimed silently when the kernel never acknowledges it", () => {
      // A kernel that publishes no status for comm messages leaves the entry
      // unacked, and the watchdog reclaims it. Nothing is awaiting it, so
      // synthesizing an error, a reply and an idle would push three messages
      // into a callback that never asked for one.
      const received = [];
      kernel.executionCallbacks.comm_1 = {
        callback: (message, channel) => received.push([message.header.msg_type, channel]),
        suppressStatus: true,
        requestType: "comm_msg",
        expectsReply: false,
        replySeen: false,
        idleSeen: false,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };

      kernel._settleUnanswered("comm_1", "comm_msg", "NoReplyError", "never acknowledged");

      expect(received).toEqual([]);
      expect(kernel.states).toEqual([]);
      expect(kernel.executionCallbacks.comm_1).toBeUndefined();
    });
  });

  describe("an unanswered request that expects a reply", () => {
    it("still settles with an error, a reply and an idle", () => {
      // Unchanged: an awaiting caller resolves on that synthesized idle, and
      // forgetting it is what hangs a batch.
      const received = [];
      kernel.executionCallbacks.execute_1 = {
        callback: (message, channel) => received.push([message.header.msg_type, channel]),
        suppressStatus: false,
        requestType: "execute_request",
        expectsReply: true,
        replySeen: false,
        idleSeen: false,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };

      kernel._settleUnanswered("execute_1", "execute_request", "NoReplyError", "lost");

      expect(received).toEqual([
        ["error", "iopub"],
        ["execute_reply", "shell"],
        ["status", "iopub"],
      ]);
      expect(kernel.states).toEqual(["idle"]);
    });
  });

  describe("the default", () => {
    it("expects a reply when nothing says otherwise", async () => {
      await kernel._sendShellMessage(
        kernel._createMessage("execute_request", "execute_1"),
        "execute_1",
        () => {},
      );

      expect(kernel.executionCallbacks.execute_1.expectsReply).toBe(true);
    });
  });

  describe("a one-shot request", () => {
    const sendComplete = () =>
      kernel._sendShellMessage(
        kernel._createMessage("complete_request", "complete_1"),
        "complete_1",
        (message, channel) => kernel.seen.push([message.header.msg_type, channel]),
        true,
      );

    it("is not retired by its reply alone", async () => {
      await sendComplete();

      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));

      expect(Object.keys(kernel.executionCallbacks)).toEqual(["complete_1"]);
    });

    it("is retired once the reply and the trailing idle have both arrived", async () => {
      await sendComplete();

      kernel.onIOMessage(statusMessage("complete_1", "busy", "complete_request"));
      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));
      kernel.onIOMessage(statusMessage("complete_1", "idle", "complete_request"));

      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });

    it("is retired when the idle arrives before the reply", async () => {
      await sendComplete();

      kernel.onIOMessage(statusMessage("complete_1", "idle", "complete_request"));
      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));

      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });

    it("keeps a suppressed cell off the status bar when its idle follows its reply", async () => {
      // The suppression floor lists only non-cell types, so for an
      // execute-shaped request — a watch refetch — only the entry's own flag
      // protects the bar, and only unified retirement keeps that entry alive
      // until the idle. This is the case the floor cannot catch.
      await kernel._sendShellMessage(
        kernel._createMessage("execute_request", "watch_1"),
        "watch_1",
        () => {},
        true,
      );

      kernel.onIOMessage(statusMessage("watch_1", "busy", "execute_request"));
      kernel.onShellMessage(replyMessage("watch_1"));
      kernel.onIOMessage(statusMessage("watch_1", "idle", "execute_request"));

      expect(kernel.states).toEqual([]);
      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });

    it("keeps the status bar still when its idle follows its reply", async () => {
      // The ordering ipykernel actually produces: it publishes idle only once
      // the handler that sent the reply has returned.
      await sendComplete();

      kernel.onIOMessage(statusMessage("complete_1", "busy", "complete_request"));
      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));
      kernel.onIOMessage(statusMessage("complete_1", "idle", "complete_request"));

      expect(kernel.states).toEqual([]);
    });

    it("delivers its reply to the caller exactly once", async () => {
      await sendComplete();

      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));
      kernel.onIOMessage(statusMessage("complete_1", "idle", "complete_request"));
      kernel.onShellMessage(replyMessage("complete_1", "complete_request"));

      expect(kernel.seen.filter(([type]) => type === "complete_reply").length).toBe(1);
    });

    it("is retired even when the callback throws", () => {
      // The callback now runs before the bookkeeping, and it is a plugin's to
      // supply through the middleware chain.
      armedEntry(kernel, "complete_1", {
        requestType: "complete_request",
        idleSeen: true,
        halfSettledAt: Date.now(),
        callback: () => {
          throw new Error("plugin blew up");
        },
      });

      expect(() => kernel.onShellMessage(replyMessage("complete_1", "complete_request"))).toThrow();
      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });
  });

  describe("a request the kernel half-answered", () => {
    let watchdogKernel;

    beforeEach(() => {
      watchdogKernel = kernel;
      watchdogKernel._ackWatchdog = null;
      watchdogKernel._startAckWatchdog();
    });

    afterEach(() => {
      watchdogKernel._stopAckWatchdog();
    });

    it("is given the trailing idle its caller is still waiting on", () => {
      // A batch resolves on reply and idle together, and a watch holds every
      // watch pane in the window until its idle lands.
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([["status", "iopub"]]);
      expect(kernel.states).toEqual(["idle"]);
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("is given no error and no second reply along with it", () => {
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen.some(([type]) => type === "error" || type === "execute_reply")).toBe(
        false,
      );
    });

    it("releases a suppressed request without moving the status bar", () => {
      armedEntry(kernel, "watch_1", {
        suppressStatus: true,
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([["status", "iopub"]]);
      expect(kernel.states).toEqual([]);
    });

    it("is settled with an error when the reply is what went missing", () => {
      // The caller has nothing, so it needs the error — but it already had
      // its idle, and a second one would be a duplicate.
      armedEntry(kernel, "execute_1", {
        idleSeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([
        ["error", "iopub"],
        ["execute_reply", "shell"],
      ]);
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("names the synthesized reply after the request it answers", () => {
      armedEntry(kernel, "complete_1", {
        requestType: "complete_request",
        idleSeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toContain(["complete_reply", "shell"]);
    });

    it("waits out the grace period first", () => {
      // The frame may simply be in flight on the other socket; the grace is
      // what tells a lost one from a late one.
      armedEntry(kernel, "execute_1", { replySeen: true, halfSettledAt: Date.now() });

      window.advanceClock(10000);
      expect(kernel.seen).toEqual([]);
      expect(kernel.executionCallbacks.execute_1).toBeDefined();

      window.advanceClock(10000);
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("waits for an unacknowledged request while the kernel is busy", () => {
      // The patient rule stays gated on the kernel reporting idle: a request
      // queued behind anyone's running cell hears nothing for as long as
      // that cell takes, and that is not a lost request.
      kernel._reportedExecutionState = "busy";
      armedEntry(kernel, "execute_1", {
        lastProgressAt: Date.now() - 40000,
      });
      kernel._reportedIdleSince = Date.now() - 40000;

      window.advanceClock(30000);

      expect(kernel.executionCallbacks.execute_1).toBeDefined();
    });

    it("repairs a lost idle even while the kernel still reads busy", () => {
      // The report is written only by a real status frame — when the lost
      // frame IS the trailing idle of the last request, the report sticks at
      // busy, and a repair gated on it reading idle would wait forever on
      // the very frame it exists to replace. The kernel's last word here was
      // this request's own busy, so the report is repaired along with the
      // caller: the kernel demonstrably finished.
      kernel._reportedExecutionState = "busy";
      kernel._reportedStatusParent = "execute_1";
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([["status", "iopub"]]);
      expect(kernel.states).toEqual(["idle"]);
      expect(kernel._reportedExecutionState).toBe("idle");
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("leaves the bar and the report alone when another cell owns the busy", () => {
      // The caller still gets its idle — the batch resolves, the watch hold
      // releases — but the kernel really is running someone else's cell, and
      // forcing the bar to idle would also swallow that cell's completion.
      kernel._reportedExecutionState = "busy";
      kernel._reportedStatusParent = "execute_other";
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([["status", "iopub"]]);
      expect(kernel.states).toEqual([]);
      expect(kernel._reportedExecutionState).toBe("busy");
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("postpones the repair while output for the request is still arriving", () => {
      // A background thread can stream long after the reply; traffic for the
      // request is proof its idle is merely late, not lost. Quiet for a
      // whole grace is what tells a lost frame from a busy stream.
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 60000,
        lastProgressAt: Date.now(),
      });

      window.advanceClock(10000);
      expect(kernel.executionCallbacks.execute_1).toBeDefined();

      window.advanceClock(10000);
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("is not starved by another client's traffic", () => {
      // `_reportedIdleSince` is refreshed by every idle from every client and
      // by our own suppressed work, so a dragged slider would hold it at now
      // and postpone this for as long as the drag lasted.
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        halfSettledAt: Date.now() - 20000,
        lastProgressAt: Date.now() - 20000,
      });
      kernel._reportedIdleSince = Date.now();

      window.advanceClock(10000);

      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });

    it("is left alone while the kernel is still producing output for it", () => {
      // The negative control for the other watchdog rule: neither answer has
      // arrived, but the kernel is plainly working.
      armedEntry(kernel, "execute_1", { lastProgressAt: Date.now() });

      window.advanceClock(30000);

      expect(kernel.executionCallbacks.execute_1).toBeDefined();
    });

    it("is settled when the kernel produced output and then went quiet", () => {
      // Progress then silence. Driven through the real handler, because the
      // bug this pins was a one-way flag the handler latched on the first
      // message — a fixture that never sets the flag cannot catch its return.
      armedEntry(kernel, "execute_1");
      kernel.onIOMessage({
        header: { msg_id: "stream_1", msg_type: "stream" },
        parent_header: { session: "our-session", msg_id: "execute_1", msg_type: "execute_request" },
        content: { name: "stdout", text: "working..." },
      });
      kernel.executionCallbacks.execute_1.lastProgressAt = Date.now() - 40000;
      kernel._reportedIdleSince = Date.now() - 40000;
      kernel.seen.length = 0;

      window.advanceClock(10000);

      expect(kernel.seen).toEqual([
        ["error", "iopub"],
        ["execute_reply", "shell"],
        ["status", "iopub"],
      ]);
      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
    });
  });

  describe("an unacknowledged comm", () => {
    beforeEach(() => {
      kernel._ackWatchdog = null;
      kernel._startAckWatchdog();
    });

    afterEach(() => {
      kernel._stopAckWatchdog();
    });

    it("gets the full patient timeout, not the short repair grace", async () => {
      // A comm is born with its reply excused, and classing "excused" as
      // "arrived" put it under the ten-second repair rule — timed from a null
      // stamp, so reclaimed on the watchdog's first tick. An entry deleted
      // that early trips the send staleness check, and a comm queued behind
      // a stalled chain was silently never sent.
      await kernel._sendShellMessage(
        kernel._createMessage("comm_msg", "comm_1"),
        "comm_1",
        (message, channel) => kernel.seen.push([message.header.msg_type, channel]),
        true,
        { expectsReply: false },
      );

      window.advanceClock(10000);
      expect(kernel.executionCallbacks.comm_1).toBeDefined();

      kernel.executionCallbacks.comm_1.lastProgressAt = Date.now() - 40000;
      kernel._reportedIdleSince = Date.now() - 40000;
      window.advanceClock(10000);

      expect(kernel.executionCallbacks.comm_1).toBeUndefined();
      expect(kernel.seen).toEqual([]);
      expect(kernel.states).toEqual([]);
    });

    it("is reclaimed after its busy even though that busy gates the patient rule", async () => {
      // The busy proves the kernel attended and sets the report to busy in
      // the same stroke — and only the lost idle would ever set it back. An
      // entry judged by the patient rule sat behind a gate its own lost
      // frame held shut, and while it did, the rule was off for everything.
      await kernel._sendShellMessage(
        kernel._createMessage("comm_msg", "comm_1"),
        "comm_1",
        (message, channel) => kernel.seen.push([message.header.msg_type, channel]),
        true,
        { expectsReply: false },
      );
      kernel.onIOMessage(statusMessage("comm_1", "busy"));
      expect(kernel._reportedExecutionState).toBe("busy");

      const entry = kernel.executionCallbacks.comm_1;
      entry.halfSettledAt = Date.now() - 20000;
      entry.lastProgressAt = Date.now() - 20000;
      window.advanceClock(10000);

      expect(kernel.executionCallbacks.comm_1).toBeUndefined();
      expect(kernel.states).toEqual([]);
      // Its own busy was the kernel's last word, so the report is repaired.
      expect(kernel._reportedExecutionState).toBe("idle");
    });
  });

  describe("a callback that throws on iopub", () => {
    it("does not derail the status bookkeeping", () => {
      // The throw is a plugin's, through the middleware chain. Left to
      // propagate it skipped idleSeen, retirement and the watchdog's view of
      // the kernel's state — freezing the report at busy with every repair
      // gated on it reading idle again.
      kernel._reportedExecutionState = "busy";
      armedEntry(kernel, "execute_1", {
        replySeen: true,
        callback: () => {
          throw new Error("plugin blew up");
        },
      });

      expect(() =>
        kernel.onIOMessage(statusMessage("execute_1", "idle", "execute_request")),
      ).not.toThrow();

      expect(kernel.executionCallbacks.execute_1).toBeUndefined();
      expect(kernel._reportedExecutionState).toBe("idle");
      expect(kernel.states).toEqual(["idle"]);
    });
  });

  describe("a request declared to expect no idle", () => {
    it("is retired by its reply alone", () => {
      // No caller passes expectsIdle: false today; this pins the contract so
      // the option keeps meaning something if one ever does.
      armedEntry(kernel, "odd_1", { expectsIdle: false, requestType: "kernel_info_request" });

      kernel.onShellMessage(replyMessage("odd_1", "kernel_info_request"));

      expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    });
  });

  describe("the grace period", () => {
    it("is at least one watchdog poll", () => {
      // Below the poll interval it is unenforceable, and the mechanism it
      // guards would silently never run.
      expect(ZMQKernel.HALF_SETTLED_GRACE_MS).toBeGreaterThanOrEqual(
        ZMQKernel.ACK_POLL_INTERVAL_MS,
      );
    });
  });

  describe("a status whose request is already gone", () => {
    // The entry is the authority on suppression only while it exists, and it
    // routinely does not: the kernel replies before it publishes the trailing
    // idle, and the reply retires the entry. Falling back to "not suppressed"
    // put an autocomplete keystroke's idle on the status bar — which, mid-cell,
    // freezes the duration, fires every watch, and leaves the cell's real
    // completion to emit nothing at all, because the state is already idle.
    it("is suppressed when it belongs to an introspection request", () => {
      kernel.executionState = "busy";

      kernel.onIOMessage(statusMessage("complete_orphan", "idle", "complete_request"));

      expect(kernel.states).toEqual([]);
    });

    it("is suppressed for another client's introspection too", () => {
      // A foreign request never had an entry here, so nothing but the parent
      // type can tell this from a cell finishing.
      kernel.executionState = "busy";
      const message = statusMessage("their_complete", "idle", "complete_request");
      message.parent_header.session = "their-session";

      kernel.onIOMessage(message);

      expect(kernel.states).toEqual([]);
    });

    it("still moves the status bar when it belongs to a cell", () => {
      // The negative control: a cell is a cell whoever ran it.
      kernel.executionState = "busy";

      kernel.onIOMessage(statusMessage("execute_orphan", "idle", "execute_request"));

      expect(kernel.states).toEqual(["idle"]);
    });
  });

  describe("a status from the process a restart just killed", () => {
    it("does not put the state back to idle", () => {
      // Buffered in the SUB socket and delivered after the restart began. The
      // autocomplete provider gates on this state, so an early "idle" sends
      // completions into a socket with no process behind it.
      kernel.lifecycle = "restarting";

      kernel.onIOMessage(statusMessage("execute_straggler", "idle", "execute_request"));

      expect(kernel.states).toEqual([]);
    });

    it("moves it again once the kernel is ready", () => {
      kernel.lifecycle = "ready";

      kernel.onIOMessage(statusMessage("execute_1", "busy", "execute_request"));

      expect(kernel.states).toEqual(["busy"]);
    });
  });
});

describe("shutting a kernel down", () => {
  // Every caller pairs shutdown with destroy, and destroy ends in SIGKILL. The
  // request used to lose that race twice over: `_sendShellMessage` makes a send
  // conditional on its callback entry surviving until the send's turn comes,
  // and destroy clears the whole table in the same tick — so the request was
  // dropped as stale before it went out, and the signal would have beaten it
  // anyway. Nothing in the kernel's own teardown ever ran.
  //
  // The ordering of what follows the send is load-bearing. The sockets must
  // close while the kernel still lives — it is alive right then, running its
  // atexit — because a close landing after the process died goes into the RST
  // storm of a dead peer, and on Windows that corrupts libzmq's shared io
  // thread: the next kernel's sockets never connect at all, and the window
  // crashes natively at unload. Waiting for the exit first, as the first cut
  // of this did, inverted exactly that.
  let kernel;

  function exitingProcess() {
    const listeners = {};
    return {
      exitCode: null,
      signalCode: null,
      once(event, listener) {
        listeners[event] = listener;
      },
      removeListener() {},
      exit: () => listeners.exit?.(0, null),
    };
  }

  /** The send and the exit wait are several microtask hops apart. */
  async function flush() {
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    kernel = bareKernel();
    kernel.kernelSpec = { display_name: "Python 3" };
    kernel.ioSocket = fakeSocket();
    kernel.stdinSocket = fakeSocket();
    kernel.kernelProcess = exitingProcess();
  });

  it("actually sends the request", async () => {
    const socket = kernel.shellSocket;
    const shutdown = kernel.shutdown();
    await flush();
    kernel.kernelProcess.exit();
    await shutdown;

    expect(socket.sent.length).toBe(1);
  });

  it("registers no callback entry for it", async () => {
    // An entry is what made the send conditional on a table that destroy is
    // about to clear, and nothing is waiting on the reply in any case.
    const shutdown = kernel.shutdown();
    await flush();
    kernel.kernelProcess.exit();
    await shutdown;

    expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
  });

  it("survives the state being cleared in the same tick", async () => {
    const socket = kernel.shellSocket;
    const shutdown = kernel.shutdown();
    kernel._clearState("Kernel shut down");
    await flush();
    kernel.kernelProcess.exit();
    await shutdown;

    expect(socket.sent.length).toBe(1);
  });

  it("waits for the process to exit", async () => {
    let settled = false;
    kernel.shutdown().then(() => {
      settled = true;
    });

    await flush();
    expect(settled).toBe(false);

    kernel.kernelProcess.exit();
    await flush();
    expect(settled).toBe(true);
  });

  it("gives up on a kernel that will not go", async () => {
    // Best-effort: the destroy that follows kills it regardless.
    let settled = false;
    kernel.shutdown().then(() => {
      settled = true;
    });
    await flush();

    window.advanceClock(ZMQKernel.SHUTDOWN_TIMEOUT_MS);
    await flush();

    expect(settled).toBe(true);
  });

  it("joins a second call to the first instead of racing it", async () => {
    // Unlatched, the repeat failed instantly on the already-released sockets
    // and its caller's destroy SIGKILLed the kernel in the middle of the
    // very atexit the first request started.
    const socket = kernel.shellSocket;
    const first = kernel.shutdown();
    const second = kernel.shutdown();
    expect(second).toBe(first);

    await flush();
    kernel.kernelProcess.exit();
    await first;

    expect(socket.sent.length).toBe(1);
  });

  it("marks the exit it is about to cause as expected", async () => {
    const shutdown = kernel.shutdown();
    expect(kernel._expectingExit).toBe(true);

    await flush();
    kernel.kernelProcess.exit();
    await shutdown;
  });

  it("refuses a restart once a shutdown is in flight", async () => {
    const shutdown = kernel.shutdown();
    kernel._socketRestart(() => {});

    // The refusal is the assertion: an accepted restart would have thrown on
    // the released sockets, or worse, spawned a process nothing can reach.
    expect(kernel.lifecycle).toBe("ready");

    await flush();
    kernel.kernelProcess.exit();
    await shutdown;
  });

  it("settles a request sent while the kernel is shutting down", async () => {
    // The socket is already gone; a raw TypeError in the caller's bubble is
    // not an answer.
    kernel.shellSocket = null;

    await kernel._sendShellMessage(
      kernel._createMessage("execute_request", "execute_late"),
      "execute_late",
      (message, channel) => kernel.seen.push([message.header.msg_type, channel]),
    );

    expect(kernel.seen).toEqual([
      ["error", "iopub"],
      ["execute_reply", "shell"],
      ["status", "iopub"],
    ]);
    expect(kernel.executionCallbacks.execute_late).toBeUndefined();
  });

  it("does not wait on a process that is already gone", async () => {
    const socket = kernel.shellSocket;
    kernel.kernelProcess.exitCode = 0;

    await kernel.shutdown();

    expect(socket.sent.length).toBe(1);
  });

  it("closes the sockets while the process is still alive", async () => {
    // Not after: a close into a dead peer's RST storm corrupts libzmq's io
    // thread on Windows, and no socket created afterwards ever connects —
    // the next kernel's included.
    const socket = kernel.shellSocket;
    const shutdown = kernel.shutdown();
    await flush();

    // The process has not exited yet, and the socket is already down.
    expect(socket.closed).toBe(true);

    kernel.kernelProcess.exit();
    await shutdown;
  });

  it("leaves nothing for destroy to close", async () => {
    // Destroy runs right after every shutdown; a second close must find the
    // refs already gone rather than the sockets again.
    const shutdown = kernel.shutdown();
    await flush();
    kernel.kernelProcess.exit();
    await shutdown;

    expect(kernel.shellSocket).toBe(null);
    expect(kernel.ioSocket).toBe(null);
    expect(kernel.stdinSocket).toBe(null);
  });

  it("closes every socket it holds, once", () => {
    const shell = kernel.shellSocket;
    const io = kernel.ioSocket;
    const stdin = kernel.stdinSocket;

    kernel._releaseSockets(false);
    kernel._releaseSockets(false);

    expect(shell.closed).toBe(true);
    expect(io.closed).toBe(true);
    expect(stdin.closed).toBe(true);
  });
});
