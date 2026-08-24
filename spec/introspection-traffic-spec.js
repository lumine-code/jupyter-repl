const fs = require("fs");
const path = require("path");
const ZMQKernel = require("../lib/zmq-kernel");

// Everything else in this suite is hand-written, so it can only prove the
// transport agrees with itself. The premise it all stands on — every shell
// request is answered by a reply on shell and a busy/idle pair on iopub,
// parented to it — is a claim about kernels, and this is the one place it is
// checked against a real one: unified retirement waits on that idle, the
// suppression floor keys on that parent type, and the half-settled reclaim
// assumes the pair was published at all.
//
// The fixture is a capture from ipykernel (script/record_shell_fixture.py
// regenerates it): one round trip per non-cell request type. The recorder
// drains shell before iopub, so the fixture's reply-before-pair ordering is
// a drain artifact — on the wire ipykernel sends busy, then the reply, then
// idle — and the assertions below are order-agnostic on purpose. The replay
// still exercises reply-before-idle, the ordering that used to strand the
// suppression.

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "shell-introspection-traffic.json"), "utf8"),
);

function bareKernel() {
  const kernel = Object.create(ZMQKernel.prototype);
  kernel._destroyed = false;
  kernel.sessionId = fixture.session;
  kernel.executionCallbacks = {};
  kernel._readyProbeIds = new Set();
  kernel.lifecycle = "ready";
  kernel.executionState = "idle";
  kernel._reportedExecutionState = "idle";
  kernel._reportedIdleSince = Date.now();
  kernel.states = [];
  kernel.setExecutionState = (state) => kernel.states.push(state);
  kernel.setExecutionCount = () => {};
  kernel.setExecutionStartTime = () => {};
  kernel.setLastExecutionTime = () => {};
  return kernel;
}

function deliver(kernel, message) {
  if (message.channel === "shell") {
    kernel.onShellMessage(message);
  } else {
    kernel.onIOMessage(message);
  }
}

describe("replaying real introspection traffic", () => {
  it("covers every request type the suppression floor names", () => {
    // The floor is a list; a request type recorded here but missing from the
    // list would drive the status bar again. comm_* are exercised by their
    // own hand-written specs — they need a registered target to record.
    const recorded = fixture.requests.map((request) => request.msg_type);
    expect(recorded).toEqual([
      "kernel_info_request",
      "complete_request",
      "inspect_request",
      "comm_info_request",
      "is_complete_request",
      "history_request",
    ]);
  });

  it("answers every request with a reply and a busy/idle pair parented to it", () => {
    // The premise itself, straight from the capture.
    for (const request of fixture.requests) {
      const mine = fixture.messages.filter(
        (message) => message.parent_header.msg_id === request.msg_id,
      );
      const replies = mine.filter((message) => message.channel === "shell");
      const busy = mine.filter((message) => message.content.execution_state === "busy");
      const idle = mine.filter((message) => message.content.execution_state === "idle");

      expect(replies.length).withContext(request.msg_type).toBe(1);
      expect(replies[0].header.msg_type)
        .withContext(request.msg_type)
        .toBe(request.msg_type.replace(/_request$/, "_reply"));
      expect(busy.length).withContext(request.msg_type).toBe(1);
      expect(idle.length).withContext(request.msg_type).toBe(1);
    }
  });

  it("stamps every message with the session that asked", () => {
    // What `_isOwnMessage` keys on; a kernel that stopped echoing it would
    // orphan all of this traffic.
    for (const message of fixture.messages) {
      expect(message.parent_header.session).toBe(fixture.session);
    }
  });

  it("retires every request and answers every caller exactly once", () => {
    const kernel = bareKernel();
    const answers = {};
    for (const request of fixture.requests) {
      answers[request.msg_id] = [];
      kernel.executionCallbacks[request.msg_id] = {
        callback: (message, channel) => {
          if (channel === "shell") answers[request.msg_id].push(message.header.msg_type);
        },
        suppressStatus: true,
        requestType: request.msg_type,
        expectsReply: true,
        expectsIdle: true,
        replySeen: false,
        idleSeen: false,
        halfSettledAt: null,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };
    }

    for (const message of fixture.messages) {
      deliver(kernel, message);
    }

    expect(Object.keys(kernel.executionCallbacks)).toEqual([]);
    for (const request of fixture.requests) {
      expect(answers[request.msg_id])
        .withContext(request.msg_type)
        .toEqual([request.msg_type.replace(/_request$/, "_reply")]);
    }
  });

  it("moves the status bar for none of it while the entries live", () => {
    const kernel = bareKernel();
    for (const request of fixture.requests) {
      kernel.executionCallbacks[request.msg_id] = {
        callback: () => {},
        suppressStatus: true,
        requestType: request.msg_type,
        expectsReply: true,
        expectsIdle: true,
        replySeen: false,
        idleSeen: false,
        halfSettledAt: null,
        lastProgressAt: Date.now(),
        armedAt: Date.now(),
      };
    }
    kernel.executionState = "busy";

    for (const message of fixture.messages) {
      deliver(kernel, message);
    }

    expect(kernel.states).toEqual([]);
  });

  it("moves it for none of it when no entry exists at all", () => {
    // The suppression floor against real traffic: another client's
    // introspection on a shared kernel, or our own once the entry is retired.
    // Before the floor, each of these idles was a did-become-idle — every
    // watch refetching on someone else's keystroke.
    const kernel = bareKernel();
    kernel.executionState = "busy";

    for (const message of fixture.messages.filter((message) => message.channel === "iopub")) {
      kernel.onIOMessage(message);
    }

    expect(kernel.states).toEqual([]);
  });
});
