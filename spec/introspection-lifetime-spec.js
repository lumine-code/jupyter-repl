const ZMQKernel = require("../lib/zmq-kernel");

// `_clearState` used to drop the whole callback table in silence. For an
// execution that was harmless — the facade aborts those separately, before
// every caller of this — but nothing tracks a completion, an inspection or a
// comm_info query anywhere else, so each one left its caller's promise pending
// for the life of the window. The MCP inspect tool waits on one of those.
//
// The settling has to happen against a table already taken and replaced, which
// is why `_settlePending` exists apart from the lookup in `_settleUnanswered`:
// a callback that arms a fresh request while being settled must keep it.
//
// And it must never move the execution state. `_clearState`'s three callers
// own that — a restart has just set "restarting" and would find it back at
// "idle", which is also the gate the autocomplete provider consults before
// sending anything.

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
  kernel._readyProbeIds = new Set();
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel.states = [];
  kernel.resets = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  kernel.emitDidResetComms = (reason) => kernel.resets.push(reason);
  kernel.shellSocket = fakeSocket();
  return kernel;
}

function armedEntry(kernel, requestId, requestType, overrides = {}) {
  const seen = [];
  kernel.executionCallbacks[requestId] = {
    callback: (message, channel) => seen.push([message.header.msg_type, channel]),
    suppressStatus: false,
    requestType,
    expectsReply: true,
    expectsIdle: true,
    replySeen: false,
    idleSeen: false,
    halfSettledAt: null,
    lastProgressAt: Date.now(),
    armedAt: Date.now(),
    ...overrides,
  };
  return seen;
}

describe("introspection outliving its kernel", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
  });

  describe("clearing the transport's state", () => {
    it("settles a pending completion instead of dropping it", () => {
      const seen = armedEntry(kernel, "complete_1", "complete_request");

      kernel._clearState("Kernel restarted");

      expect(seen).toEqual([
        ["error", "iopub"],
        ["complete_reply", "shell"],
        ["status", "iopub"],
      ]);
      expect(kernel.executionCallbacks.complete_1).toBeUndefined();
    });

    it("settles a pending inspection the same way", () => {
      const seen = armedEntry(kernel, "inspect_1", "inspect_request");

      kernel._clearState("Kernel shut down");

      expect(seen).toContain(["inspect_reply", "shell"]);
    });

    it("tells the caller why", () => {
      let content = null;
      kernel.executionCallbacks.complete_1 = {
        callback: (message, channel) => {
          if (channel === "shell") content = message.content;
        },
        suppressStatus: false,
        requestType: "complete_request",
        expectsReply: true,
        expectsIdle: true,
        replySeen: false,
        idleSeen: false,
        halfSettledAt: null,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };

      kernel._clearState("Kernel restarted");

      expect(content.status).toBe("error");
      expect(content.evalue).toBe("Kernel restarted");
    });

    it("moves the execution state for none of them", () => {
      // Even the unsuppressed ones — the internal traffic that arms them, the
      // ready probe and the startup code, has no caller watching the bar.
      armedEntry(kernel, "complete_1", "complete_request");
      armedEntry(kernel, "execute_1", "execute_request");
      armedEntry(kernel, "watch_1", "execute_request", { suppressStatus: true });

      kernel._clearState("Kernel restarted");

      expect(kernel.states).toEqual([]);
    });

    it("leaves a restart's state alone", () => {
      // The autocomplete provider gates on this being anything but "idle", so
      // flipping it back mid-restart sends completions into a dying socket —
      // arming the very entries this settling exists to reclaim.
      kernel.executionState = "restarting";
      armedEntry(kernel, "execute_1", "execute_request");

      kernel._clearState("Kernel restarted");

      expect(kernel.states).toEqual([]);
    });

    it("reclaims a comm entry silently", () => {
      const seen = armedEntry(kernel, "comm_1", "comm_msg", { expectsReply: false });

      kernel._clearState("Kernel restarted");

      expect(seen).toEqual([]);
      expect(kernel.executionCallbacks.comm_1).toBeUndefined();
    });

    it("keeps a request armed by the callback it just settled", () => {
      // The table is replaced before anything is notified, so a caller that
      // reacts by asking again is not wiped by its own settling.
      kernel.executionCallbacks.complete_1 = {
        callback: (message, channel) => {
          if (channel !== "shell") return;
          kernel.executionCallbacks.complete_2 = { callback: () => {} };
        },
        suppressStatus: false,
        requestType: "complete_request",
        expectsReply: true,
        expectsIdle: true,
        replySeen: false,
        idleSeen: false,
        halfSettledAt: null,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };

      kernel._clearState("Kernel restarted");

      expect(Object.keys(kernel.executionCallbacks)).toEqual(["complete_2"]);
    });

    it("delivers only the missing idle to a request already answered", () => {
      // A half-settled entry swept up here already gave its caller the real
      // answer; a synthesized error reply after a real ok one is two
      // contradictory answers to one request.
      const seen = armedEntry(kernel, "execute_1", "execute_request", { replySeen: true });

      kernel._clearState("Kernel restarted");

      expect(seen).toEqual([["status", "iopub"]]);
    });

    it("delivers no second idle to a request whose idle already arrived", () => {
      const seen = armedEntry(kernel, "execute_1", "execute_request", { idleSeen: true });

      kernel._clearState("Kernel restarted");

      expect(seen).toEqual([
        ["error", "iopub"],
        ["execute_reply", "shell"],
      ]);
    });

    it("settles each entry exactly once", () => {
      const seen = armedEntry(kernel, "complete_1", "complete_request");

      kernel._clearState("Kernel restarted");
      kernel._settleUnanswered("complete_1", "complete_request", "NoReplyError", "again");

      expect(seen.filter(([type]) => type === "complete_reply").length).toBe(1);
    });

    it("still resets the comms", () => {
      armedEntry(kernel, "complete_1", "complete_request");

      kernel._clearState("Kernel restarted");

      expect(kernel.resets).toEqual(["Kernel restarted"]);
    });
  });

  describe("a pending comm_info query", () => {
    it("is rejected rather than left hanging", async () => {
      const pending = kernel.requestCommInfo();

      kernel._clearState("Kernel restarted");

      await expectAsync(pending).toBeRejectedWithError(/Kernel restarted/);
    });
  });
});
