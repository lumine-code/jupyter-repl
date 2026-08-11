const ZMQKernel = require("../lib/zmq-kernel");

// Comm traffic is kernel-scoped, and output is not. That difference is the
// whole of this file.
//
// Everything else on iopub is routed by two request-scoped checks — a message
// must carry a full parent_header, and its session must be ours — because
// another client's output is that client's to display and a colliding msg_id
// must never reach one of our callbacks. Neither check applies to a comm:
// parent_header.session defends against msg_ids that two clients mint
// independently, and a comm_id is minted by the kernel and unique across it by
// construction. Applying them anyway is what makes a second window's slider
// silently desync from the value the kernel actually holds, and what drops the
// echo ipywidgets needs to see to suppress its own.

const OURS = "our-session";
const THEIRS = "another-clients-session";

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
  kernel.sessionId = OURS;
  kernel.executionCallbacks = {};
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel.idleSince = Date.now();
  kernel.states = [];
  kernel.resets = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  kernel.setExecutionCount = () => {};
  kernel.setExecutionStartTime = () => {};
  kernel.setLastExecutionTime = () => {};
  kernel.emitDidResetComms = (reason) => kernel.resets.push(reason);
  kernel.shellSocket = fakeSocket();
  return kernel;
}

/** The minimal output store duck type the orphan path writes into. */
function outputStore() {
  return {
    outputs: [],
    appendOutput(output) {
      this.outputs.push(output);
    },
  };
}

function commOpen({ session, commId = "c1", target = "jupyter.widget" } = {}) {
  const message = {
    header: { msg_id: `open_${commId}`, msg_type: "comm_open" },
    content: { comm_id: commId, target_name: target, data: {} },
  };
  // A kernel-initiated open carries no parent at all; one caused by a cell
  // carries that cell's.
  message.parent_header = session
    ? { session, msg_id: "execute_1", msg_type: "execute_request" }
    : {};
  return message;
}

function commMsg({ session, commId = "c1", data = {} } = {}) {
  const message = {
    header: { msg_id: `msg_${commId}`, msg_type: "comm_msg" },
    content: { comm_id: commId, data },
  };
  message.parent_header = session
    ? { session, msg_id: "execute_1", msg_type: "execute_request" }
    : {};
  return message;
}

async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("comm routing on the ZMQ transport", () => {
  let kernel;
  let opened;
  let received;

  beforeEach(() => {
    kernel = bareKernel();
    opened = [];
    received = [];
    kernel.registerCommTarget("jupyter.widget", (comm) => {
      opened.push(comm.comm_id);
      comm.on_msg((message) => received.push(message.content.data));
    });
  });

  describe("what the request-scoped checks would have dropped", () => {
    it("delivers a comm with no parent_header at all", async () => {
      // A widget updated from a background thread or an asyncio task. The
      // validity check every other iopub message passes requires a
      // parent_header.msg_id, and this has none.
      kernel.onIOMessage(commOpen({ session: OURS }));
      await settle();
      kernel.onIOMessage(commMsg({ data: { value: 7 } }));
      await settle();

      expect(received).toEqual([{ value: 7 }]);
    });

    it("delivers a comm message from another client's session", async () => {
      // Two Lumine windows on one kernel: window A drags the slider, the
      // kernel broadcasts the resulting update stamped with A's session, and
      // window B must follow it or show a value the kernel does not hold.
      kernel.onIOMessage(commOpen({ session: OURS }));
      await settle();
      kernel.onIOMessage(commMsg({ session: THEIRS, data: { value: 5 } }));
      await settle();

      expect(received).toEqual([{ value: 5 }]);
    });

    it("opens a comm another client created", async () => {
      // Model state is kernel state. A console on the shared kernel can build
      // the widget that one of our own cells later displays, and asking the
      // kernel for its comms would recreate this one anyway.
      kernel.onIOMessage(commOpen({ session: THEIRS, commId: "theirs" }));
      await settle();

      expect(opened).toEqual(["theirs"]);
    });
  });

  describe("what comm routing must not touch", () => {
    it("keeps a comm message out of the execution callbacks", async () => {
      // The open below names one of our live executions as its parent, which
      // is exactly what a display(IntSlider()) produces.
      const seen = [];
      kernel.executionCallbacks.execute_1 = {
        callback: (message) => seen.push(message.header.msg_type),
        suppressStatus: false,
        requestType: "execute_request",
        expectsReply: true,
        replySeen: false,
        idleSeen: false,
        acked: false,
        armedAt: Date.now(),
      };

      kernel.onIOMessage(commOpen({ session: OURS }));
      await settle();

      expect(seen).toEqual([]);
    });

    it("appends nothing to the output store", async () => {
      // Before this routing existed a comm reached appendOutput, matched no
      // branch, and still cost a re-render of every output in the bubble.
      const store = outputStore();
      kernel.setLastOutputStore(store);

      kernel.onIOMessage(commOpen({ session: OURS }));
      kernel.onIOMessage(commMsg({ session: OURS, data: { value: 1 } }));
      await settle();

      expect(store.outputs).toEqual([]);
    });

    it("drives no status", async () => {
      kernel.onIOMessage(commOpen({ session: OURS }));
      kernel.onIOMessage(commMsg({ session: OURS, data: { value: 1 } }));
      await settle();

      expect(kernel.states).toEqual([]);
    });

    it("still routes ordinary output by session", async () => {
      // The rule that comms escape is the one output still lives by.
      const store = outputStore();
      kernel.setLastOutputStore(store);

      kernel.onIOMessage({
        header: { msg_id: "s1", msg_type: "stream" },
        parent_header: { session: THEIRS, msg_id: "execute_gone", msg_type: "execute_request" },
        content: { name: "stdout", text: "theirs\n" },
      });
      kernel.onIOMessage({
        header: { msg_id: "s2", msg_type: "stream" },
        parent_header: { session: OURS, msg_id: "execute_gone", msg_type: "execute_request" },
        content: { name: "stdout", text: "ours\n" },
      });

      expect(store.outputs.map((o) => o.text)).toEqual(["ours\n"]);
    });
  });

  describe("sending", () => {
    it("suppresses status and expects no reply", () => {
      const comm = kernel.createComm("jupyter.widget", "c1");

      comm.send({ value: 3 });

      const [requestId] = Object.keys(kernel.executionCallbacks);
      expect(kernel.executionCallbacks[requestId].suppressStatus).toBe(true);
      expect(kernel.executionCallbacks[requestId].expectsReply).toBe(false);
      expect(kernel.shellSocket.sent.length).toBe(1);
    });

    it("returns the request id synchronously", () => {
      const comm = kernel.createComm("jupyter.widget", "c1");

      expect(typeof comm.send({ value: 3 })).toBe("string");
    });
  });

  describe("reset", () => {
    it("drops comms and announces it, keeping the target claim", async () => {
      kernel.onIOMessage(commOpen({ session: OURS }));
      await settle();

      kernel._clearState("Kernel restarted");

      expect(kernel.resets).toEqual(["Kernel restarted"]);
      expect(kernel.getComm("c1")).toBeUndefined();

      kernel.onIOMessage(commOpen({ session: OURS, commId: "c2" }));
      await settle();

      expect(opened).toEqual(["c1", "c2"]);
    });

    it("sends no comm_close when it drops them", async () => {
      kernel.onIOMessage(commOpen({ session: OURS }));
      await settle();
      kernel.shellSocket.sent.length = 0;

      kernel._clearState("Kernel restarted");

      expect(kernel.shellSocket.sent).toEqual([]);
    });
  });
});
