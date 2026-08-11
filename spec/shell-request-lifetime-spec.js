const ZMQKernel = require("../lib/zmq-kernel");

// Every shell request this package sent until now was answered on the shell
// channel, so a callback entry was retired on `replySeen && idleSeen`. A comm
// message is the first that is never answered there: the kernel acknowledges it
// only with the busy/idle pair it publishes around any shell message. That
// flips `acked`, which is what the watchdog reclaims on — so the entry is not
// reclaimed by anything and is stranded for the life of the connection. A
// dragged slider sends one per frame.
//
// `expectsReply: false` is the third callback lifetime: retire on the trailing
// idle alone, and settle silently, because there is no caller waiting.

function fakeSocket() {
  return {
    sent: [],
    async send(message) {
      this.sent.push(message);
    },
  };
}

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.sessionId = "our-session";
  kernel.executionCallbacks = {};
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel.idleSince = Date.now();
  kernel.states = [];
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

function replyMessage(requestId) {
  return {
    header: { msg_id: `reply_${requestId}`, msg_type: "execute_reply" },
    parent_header: { session: "our-session", msg_id: requestId, msg_type: "execute_request" },
    content: { status: "ok" },
  };
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
        acked: false,
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
        acked: false,
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
});
