const fs = require("fs");
const path = require("path");
const ZMQKernel = require("../lib/zmq-kernel");

// A kernel can serve more than one client at once: a `jupyter console` opened
// against the same connection file, or a second Lumine window. IOPub is a
// broadcast, so every client's output and status arrives on our socket too.
// Traffic we did not ask for used to be taken for our own background-thread
// output, which appended a console's results to whichever inline result bubble
// we filled last, and let a console's idle status mark our running cell failed.

const OURS = "11111111-1111-1111-1111-111111111111";
const THEIRS = "22222222-2222-2222-2222-222222222222";

function bareKernel() {
  // Object.create skips the class field initializers, so everything onIOMessage
  // touches is set explicitly here -- including the session id the real field
  // seeds with a fresh uuid.
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.sessionId = OURS;
  kernel.executionCallbacks = {};
  kernel.executionQueue = [];
  kernel.currentExecutionRequest = null;
  kernel.deferredExecuteReplies = new Map();
  kernel.idleBeforeReply = new Map();
  kernel.deferredIdleState = new Map();
  kernel._lastOutputStore = null;
  kernel.states = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  return kernel;
}

function outputStore() {
  return {
    outputs: [],
    appendOutput(output) {
      this.outputs.push(output);
    },
  };
}

function streamMessage(session, msgId = "execute_gone") {
  return {
    header: { msg_id: "m1", msg_type: "stream" },
    parent_header: { session, msg_id: msgId, msg_type: "execute_request" },
    content: { name: "stdout", text: "hello\n" },
  };
}

function statusMessage(session, executionState, msgId = "execute_1") {
  return {
    header: { msg_id: "m2", msg_type: "status" },
    parent_header: { session, msg_id: msgId, msg_type: "execute_request" },
    content: { execution_state: executionState },
  };
}

describe("a kernel shared with another client", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
  });

  describe("output", () => {
    it("keeps another client's output out of our last result bubble", () => {
      const store = outputStore();
      kernel.setLastOutputStore(store);

      kernel.onIOMessage(streamMessage(THEIRS));

      expect(store.outputs).toEqual([]);
    });

    it("still routes our own background-thread output there", () => {
      const store = outputStore();
      kernel.setLastOutputStore(store);

      // No callback is registered for this id: the cell it belongs to already
      // finished, which is exactly the background-thread case.
      kernel.onIOMessage(streamMessage(OURS));

      expect(store.outputs.length).toBe(1);
      expect(store.outputs[0].text).toBe("hello\n");
    });

    it("delivers our output to a live execution callback", () => {
      const received = [];
      kernel.executionCallbacks["execute_live"] = {
        callback: (message, channel) => received.push(channel),
      };

      kernel.onIOMessage(streamMessage(OURS, "execute_live"));

      expect(received).toEqual(["iopub"]);
    });

    it("does not deliver another client's output to a live callback", () => {
      // The ids of two clients are independent, so one can collide with ours.
      // The session is what settles ownership.
      const received = [];
      kernel.executionCallbacks["execute_live"] = {
        callback: (message, channel) => received.push(channel),
      };

      kernel.onIOMessage(streamMessage(THEIRS, "execute_live"));

      expect(received).toEqual([]);
    });
  });

  describe("execution state", () => {
    it("ignores another client's status", () => {
      kernel.onIOMessage(statusMessage(THEIRS, "busy"));
      kernel.onIOMessage(statusMessage(THEIRS, "idle"));

      expect(kernel.states).toEqual([]);
    });

    it("still follows our own status", () => {
      kernel.onIOMessage(statusMessage(OURS, "busy"));

      expect(kernel.states).toEqual(["busy"]);
    });

    it("does not let another client's idle retire our pending reply", () => {
      kernel.deferredExecuteReplies.set("execute_1", {
        message: {},
        callbackInfo: { callback: () => {} },
      });

      kernel.onIOMessage(statusMessage(THEIRS, "idle", "execute_1"));

      expect(kernel.deferredExecuteReplies.has("execute_1")).toBe(true);
    });
  });

  describe("client identity", () => {
    it("stamps our own session on every request we send", () => {
      const message = kernel._createMessage("execute_request", "execute_1");

      expect(message.header.session).toBe(OURS);
      expect(message.header.msg_id).toBe("execute_1");
    });

    it("gives each connection its own identity", () => {
      // Two windows on one kernel are two clients; a session shared between
      // them would make each one's output indistinguishable from the other's.
      const other = bareKernel();
      other.sessionId = THEIRS;

      expect(other._createMessage("execute_request").header.session).toBe(THEIRS);
      expect(kernel._createMessage("execute_request").header.session).toBe(OURS);
    });

    it("falls back to our request-id namespace when a kernel sends no session", () => {
      const store = outputStore();
      kernel.setLastOutputStore(store);

      // Our own ids are all prefixed; jupyter_client mints `<session>_<pid>_<n>`.
      kernel.onIOMessage(streamMessage(undefined, "execute_mine"));
      kernel.onIOMessage(streamMessage(undefined, "9f2c_4821_7"));

      expect(store.outputs.length).toBe(1);
    });
  });
});

describe("execution state while another client holds the kernel", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
    kernel._processExecutionQueue = () => {};
  });

  it("reports busy as soon as we ask, not when the kernel answers", () => {
    // A request queued behind another client's long cell is answered only once
    // that cell finishes. A result bubble reads a non-busy kernel under a
    // running cell as a failure, so the wait would show as an error marker.
    kernel._enqueueExecution("1", () => {}, {});

    expect(kernel.states).toEqual(["busy"]);
  });

  it("leaves the status bar alone for internal executions", () => {
    kernel._enqueueExecution("1", () => {}, { suppressStatus: true });

    expect(kernel.states).toEqual([]);
  });
});

describe("a shell send that fails outright", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
    kernel.shellSocketBusy = false;
    kernel.shellMessageQueue = [];
    kernel.shellSocket = {
      async send() {
        throw new Error("socket closed");
      },
    };
  });

  it("releases the execution slot the kernel never took", async () => {
    // The reply is synthesized locally, so it never reaches the shell handler
    // that retires a request. Holding the slot would stall every later cell.
    const replies = [];
    kernel.currentExecutionRequest = "execute_1";
    kernel.executionCallbacks["execute_1"] = {
      callback: (message, channel) => replies.push(channel),
      suppressStatus: false,
    };
    kernel.shellMessageQueue.push({
      message: { header: { msg_type: "execute_request" } },
      requestId: "execute_1",
    });

    await kernel._processShellQueue();

    expect(replies).toEqual(["iopub", "shell"]);
    expect(kernel.currentExecutionRequest).toBe(null);
    expect(kernel.states).toEqual(["idle"]);
  });
});

describe("replaying real traffic from a shared kernel", () => {
  // Everything above is hand-written, so it can only prove the transport is
  // self-consistent. This replays what a client actually received while a
  // second one shared the kernel, which is the part that would break silently
  // if a kernel stopped publishing the session we key on.
  //
  // The fixture was captured against ipykernel 7.3.0 / jupyter_client 8.9.1:
  // one client runs a cell that prints and spawns a thread, a second client
  // then runs a cell of its own, and the thread prints last.
  it("shows only our own output and our own status", () => {
    const capture = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures", "shared-kernel-iopub.json"), "utf8"),
    );
    const kernel = bareKernel();
    kernel.sessionId = capture.ourSession;
    const store = outputStore();
    kernel.setLastOutputStore(store);

    for (const message of capture.messages) {
      kernel.onIOMessage(message);
    }

    const text = store.outputs.map((output) => output.text || "").join("");
    expect(text).toContain("EDITOR OUTPUT");
    expect(text).not.toContain("CONSOLE OUTPUT");
    // Once the other client has run anything, ipykernel reattributes even our
    // own background threads to it -- and that client prints them itself.
    expect(text).not.toContain("BG THREAD OUTPUT");
    // Our cell's busy and idle. The other client's five messages moved nothing.
    expect(kernel.states).toEqual(["busy", "idle"]);
  });

  it("would have leaked without the session test", () => {
    // Guards the guard: if `_isOwnMessage` were dropped, this same fixture puts
    // the other client's output straight into our bubble.
    const capture = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures", "shared-kernel-iopub.json"), "utf8"),
    );
    const kernel = bareKernel();
    kernel.sessionId = capture.ourSession;
    kernel._isOwnMessage = () => true;
    const store = outputStore();
    kernel.setLastOutputStore(store);

    for (const message of capture.messages) {
      kernel.onIOMessage(message);
    }

    const text = store.outputs.map((output) => output.text || "").join("");
    expect(text).toContain("CONSOLE OUTPUT");
  });
});
