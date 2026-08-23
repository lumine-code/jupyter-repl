const fs = require("fs");
const path = require("path");
const ZMQKernel = require("../lib/zmq-kernel");

// A kernel can serve more than one client at once: a `jupyter console` opened
// against the same connection file, or a second Lumine window. IOPub is a
// broadcast, so every client's output and status arrives on our socket too.
// Ownership decides where a message may act: output and callbacks are strictly
// ours — a console's results must never land in our result bubbles — while
// status, the execution count, and the timer describe the kernel process
// itself, so every client's traffic drives them.

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
    it("follows another client's status — the state is the kernel's", () => {
      kernel.onIOMessage(statusMessage(THEIRS, "busy"));
      kernel.onIOMessage(statusMessage(THEIRS, "idle"));

      expect(kernel.states).toEqual(["busy", "idle"]);
    });

    it("follows our own status", () => {
      kernel.onIOMessage(statusMessage(OURS, "busy"));

      expect(kernel.states).toEqual(["busy"]);
    });

    it("takes the count and per-cell timer from any client's execute_input", () => {
      kernel.onIOMessage({
        header: { msg_id: "m3", msg_type: "execute_input" },
        parent_header: { session: THEIRS, msg_id: "their_1", msg_type: "execute_request" },
        content: { code: "2+2", execution_count: 7 },
      });

      expect(kernel.executionCount).toBe(7);
      expect(kernel.lastExecutionTime).toBe("Running ...");
      expect(kernel.executionStartTime).not.toBe(null);
    });

    it("leaves the count and timer alone for our own suppressed executions", () => {
      // Watch refetches run with suppressStatus; their execute_input must not
      // masquerade as a user cell on the status bar.
      kernel.executionCallbacks["execute_w"] = {
        callback: () => {},
        suppressStatus: true,
        replySeen: false,
        idleSeen: false,
      };
      kernel.executionCount = 3;

      kernel.onIOMessage({
        header: { msg_id: "m4", msg_type: "execute_input" },
        parent_header: { session: OURS, msg_id: "execute_w", msg_type: "execute_request" },
        content: { code: "watch", execution_count: 9 },
      });

      expect(kernel.executionCount).toBe(3);
    });

    it("does not let another client's idle retire our pending callback", () => {
      // The ids of two clients are independent, so a foreign idle can carry a
      // msg_id that collides with one of ours. Ownership must keep it from
      // marking our execution as finished.
      kernel.executionCallbacks["execute_1"] = {
        callback: () => {},
        suppressStatus: false,
        replySeen: true,
        idleSeen: false,
      };

      kernel.onIOMessage(statusMessage(THEIRS, "idle", "execute_1"));

      expect(kernel.executionCallbacks["execute_1"]).toBeDefined();
      expect(kernel.executionCallbacks["execute_1"].idleSeen).toBe(false);
    });

    it("retires an execution only once reply and idle have both arrived", () => {
      const seen = [];
      kernel.executionCallbacks["execute_1"] = {
        callback: (message, channel) => seen.push(channel),
        suppressStatus: false,
        replySeen: true,
        idleSeen: false,
      };

      kernel.onIOMessage(statusMessage(OURS, "idle", "execute_1"));

      // The idle was forwarded, and with the reply already seen the callback
      // is gone — later background output goes to the orphan route instead.
      expect(seen).toEqual(["iopub"]);
      expect(kernel.executionCallbacks["execute_1"]).toBeUndefined();
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
  });
});

describe("a shell send that fails outright", () => {
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
    kernel.shellSocket = {
      async send() {
        throw new Error("socket closed");
      },
    };
  });

  it("settles the request the kernel never received", async () => {
    const replies = [];

    await kernel._sendShellMessage(
      { header: { msg_type: "execute_request", msg_id: "execute_1" } },
      "execute_1",
      (message, channel) => replies.push([message.header.msg_type, channel]),
      false,
    );

    // Error output, the reply, and the trailing idle a caller awaits on.
    expect(replies).toEqual([
      ["error", "iopub"],
      ["execute_reply", "shell"],
      ["status", "iopub"],
    ]);
    // The callback is retired: a straggler cannot reach a settled request.
    expect(kernel.executionCallbacks["execute_1"]).toBeUndefined();
    expect(kernel.states).toEqual(["idle"]);
  });
});

describe("the acknowledgment watchdog", () => {
  // A kernel with an empty queue acknowledges within milliseconds, so a
  // request still unacknowledged after a long-enough idle stretch was lost.
  // Deliberately idle-gated: while any client's cell runs, a queued request
  // legitimately hears nothing for as long as that cell takes. Idleness is
  // the reported view — every status message the kernel publishes, our own
  // suppressed traffic included — never the status-bar `executionState`,
  // which is blind to suppressed work by design.
  let kernel;

  beforeEach(() => {
    kernel = bareKernel();
    kernel.lifecycle = "ready";
    kernel._reportedExecutionState = "idle";
    kernel._ackWatchdog = null;
    kernel._startAckWatchdog();
  });

  afterEach(() => {
    kernel._stopAckWatchdog();
  });

  const registerUnacked = (agoMs) => {
    const replies = [];
    kernel._reportedIdleSince = Date.now() - agoMs;
    kernel.executionCallbacks["execute_lost"] = {
      callback: (message, channel) => replies.push(channel),
      suppressStatus: false,
      requestType: "execute_request",
      replySeen: false,
      idleSeen: false,
      // Nothing has been heard about it for the whole stretch.
      lastProgressAt: Date.now() - agoMs,
      armedAt: Date.now() - agoMs,
    };
    return replies;
  };

  const registerSuppressed = (requestId) => {
    kernel.executionCallbacks[requestId] = {
      callback: () => {},
      suppressStatus: true,
      requestType: "execute_request",
      replySeen: false,
      idleSeen: false,
      lastProgressAt: Date.now(),
      armedAt: Date.now(),
    };
  };

  it("settles a request the kernel ignored through a long idle stretch", () => {
    const replies = registerUnacked(40000);

    window.advanceClock(10000);

    expect(replies).toEqual(["iopub", "shell", "iopub"]);
    expect(kernel.executionCallbacks["execute_lost"]).toBeUndefined();
  });

  it("waits while the kernel is busy — a queued request is not a lost one", () => {
    const replies = registerUnacked(40000);
    kernel._reportedExecutionState = "busy";

    window.advanceClock(30000);

    expect(replies).toEqual([]);
    expect(kernel.executionCallbacks["execute_lost"]).toBeDefined();
  });

  it("waits while our own suppressed work keeps the kernel busy", () => {
    // A watch refetch or a widget callback runs with suppressStatus, so its
    // busy never reaches the status bar — but the kernel is exactly as
    // occupied as by a cell, and a request queued behind it is queued, not
    // lost. Judged from `executionState`, this settled the queued cell as
    // unacknowledged and the kernel then executed it anyway.
    const replies = registerUnacked(40000);
    registerSuppressed("execute_watch");
    kernel.onIOMessage(statusMessage(OURS, "busy", "execute_watch"));

    window.advanceClock(30000);

    expect(replies).toEqual([]);
    expect(kernel.executionCallbacks["execute_lost"]).toBeDefined();
    // The suppression still holds where it was meant to: the status bar.
    expect(kernel.states).toEqual([]);
  });

  it("restarts the idle stretch from a suppressed idle", () => {
    // The suppressed work finishing is when the kernel's queue may actually
    // be empty again, so the quiet stretch counts from there — the queued
    // request gets its full timeout before it is declared lost.
    const replies = registerUnacked(40000);
    registerSuppressed("execute_watch");
    kernel.onIOMessage(statusMessage(OURS, "busy", "execute_watch"));
    kernel.onIOMessage(statusMessage(OURS, "idle", "execute_watch"));

    window.advanceClock(10000);

    expect(replies).toEqual([]);
    expect(kernel.executionCallbacks["execute_lost"]).toBeDefined();
  });

  it("leaves a request the kernel is still working on alone however long it runs", () => {
    // Progress, not a one-way acknowledgement flag: a kernel that said
    // something a moment ago is working, and one that said something and then
    // went silent for the whole timeout has dropped the request after all.
    const replies = registerUnacked(40000);
    kernel.executionCallbacks["execute_lost"].lastProgressAt = Date.now();
    kernel._reportedIdleSince = Date.now();

    window.advanceClock(30000);

    expect(replies).toEqual([]);
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
  it("keeps output client-scoped while status and count follow the kernel", () => {
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
    // Both clients' cells drive the kernel-wide state and count: our run,
    // then the console's.
    expect(kernel.states).toEqual(["busy", "idle", "busy", "idle"]);
    expect(kernel.executionCount).toBe(2);
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
