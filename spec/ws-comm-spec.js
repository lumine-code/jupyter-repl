const WSKernel = require("../lib/ws-kernel");

// Comms on a remote kernel are delegated to @jupyterlab/services rather than
// reimplemented: KernelConnection dispatches them before it emits iopubMessage
// and awaits each handler in its own message loop, so building a second copy on
// top of that signal would double-handle everything. What this file pins is the
// adapter around it — and the fact that WSKernel now reports a lost kernel at
// all. It never emitted did-lose-kernel before, so the facade's subscription
// was dead for every remote kernel: an execution outstanding when the gateway
// went away hung forever, and a widget kept moving while changing nothing.

/** A minimal @lumino/signaling Signal. */
function signal() {
  const listeners = [];
  return {
    connect(listener) {
      listeners.push(listener);
    },
    emit(sender, value) {
      for (const listener of [...listeners]) listener(sender, value);
    },
  };
}

function fakeComm(commId, targetName = "jupyter.widget") {
  return {
    commId,
    targetName,
    onMsg: null,
    onClose: null,
    sent: [],
    open(data, metadata, buffers) {
      this.sent.push({ kind: "open", data, metadata, buffers });
      return { msg: { header: { msg_id: `open_${commId}` } } };
    },
    send(data, metadata, buffers) {
      this.sent.push({ kind: "send", data, metadata, buffers });
      return { msg: { header: { msg_id: `send_${commId}` } } };
    },
    close(data, metadata, buffers) {
      this.sent.push({ kind: "close", data, metadata, buffers });
      return { msg: { header: { msg_id: `close_${commId}` } } };
    },
  };
}

function fakeSession() {
  const kernel = {
    status: "idle",
    statusChanged: signal(),
    connectionStatusChanged: signal(),
    iopubMessage: signal(),
    targets: new Map(),
    comms: new Map(),
    commInfoReply: { content: { status: "ok", comms: {} } },
    registerCommTarget(name, callback) {
      this.targets.set(name, callback);
    },
    removeCommTarget(name, callback) {
      if (this.targets.get(name) === callback) this.targets.delete(name);
    },
    createComm(targetName, commId) {
      const comm = fakeComm(commId, targetName);
      this.comms.set(commId, comm);
      return comm;
    },
    async requestCommInfo(content) {
      this.commInfoRequest = content;
      return this.commInfoReply;
    },
  };
  return { kernel, disposed: false, dispose() {}, path: "/x" };
}

function build(session) {
  return new WSKernel(
    "gateway",
    { language: "python", display_name: "Python 3" },
    null,
    session ?? fakeSession(),
  );
}

describe("comms on a remote kernel", () => {
  let session;
  let kernel;

  beforeEach(() => {
    session = fakeSession();
    kernel = build(session);
  });

  afterEach(() => {
    kernel = null;
  });

  it("declares that it carries comms", () => {
    expect(kernel.supportsComms).toBe(true);
  });

  describe("the adapter", () => {
    it("hands a target handler our own comm object", () => {
      const opened = [];
      kernel.registerCommTarget("jupyter.widget", (comm) => opened.push(comm));

      const jlComm = fakeComm("c1");
      session.kernel.targets.get("jupyter.widget")(jlComm, { content: {} });

      expect(opened.length).toBe(1);
      expect(opened[0].comm_id).toBe("c1");
      expect(opened[0].target_name).toBe("jupyter.widget");
      expect(kernel.getComm("c1")).toBe(opened[0]);
    });

    it("returns one wrapper per underlying comm", () => {
      const jlComm = fakeComm("c1");
      const first = kernel._wrapComm(jlComm);
      const second = kernel._wrapComm(jlComm);

      expect(first).toBe(second);
    });

    it("returns a request id synchronously from a shell future", () => {
      // JupyterLab's send returns a future; ipywidgets wants the message id.
      const comm = kernel.createComm("jupyter.widget", "c1");

      expect(comm.send({ value: 1 })).toBe("send_c1");
      expect(comm.close()).toBe("close_c1");
    });

    it("routes an incoming message to the wrapper", () => {
      const received = [];
      kernel.registerCommTarget("jupyter.widget", (comm) => {
        comm.on_msg((message) => received.push(message.content.data));
      });
      const jlComm = fakeComm("c1");
      session.kernel.targets.get("jupyter.widget")(jlComm, { content: {} });

      jlComm.onMsg({ content: { comm_id: "c1", data: { value: 4 } } });

      expect(received).toEqual([{ value: 4 }]);
    });

    it("forgets a comm the kernel closed", () => {
      const jlComm = fakeComm("c1");
      kernel._wrapComm(jlComm);

      jlComm.onClose({ content: { comm_id: "c1", data: {} } });

      expect(kernel.getComm("c1")).toBeUndefined();
    });

    it("disposes a target claim", () => {
      const claim = kernel.registerCommTarget("jupyter.widget", () => {});

      claim.dispose();

      expect(session.kernel.targets.has("jupyter.widget")).toBe(false);
    });

    it("unwraps a comm_info reply", async () => {
      session.kernel.commInfoReply = {
        content: { status: "ok", comms: { c9: { target_name: "jupyter.widget" } } },
      };

      const comms = await kernel.requestCommInfo("jupyter.widget");

      expect(comms).toEqual({ c9: { target_name: "jupyter.widget" } });
      expect(session.kernel.commInfoRequest).toEqual({ target_name: "jupyter.widget" });
    });

    it("resolves empty when the kernel reports an error", async () => {
      session.kernel.commInfoReply = { content: { status: "error" } };

      expect(await kernel.requestCommInfo()).toEqual({});
    });
  });

  describe("reset", () => {
    it("drops comms when the kernel restarts", () => {
      const resets = [];
      kernel.onDidResetComms((reason) => resets.push(reason));
      kernel._wrapComm(fakeComm("c1"));

      session.kernel.status = "restarting";
      session.kernel.statusChanged.emit(session.kernel, "restarting");

      expect(resets).toEqual(["Kernel restarting"]);
      expect(kernel.getComm("c1")).toBeUndefined();
    });

    it("drops comms when the kernel autorestarts", () => {
      const resets = [];
      kernel.onDidResetComms((reason) => resets.push(reason));

      session.kernel.status = "autorestarting";
      session.kernel.statusChanged.emit(session.kernel, "autorestarting");

      expect(resets).toEqual(["Kernel autorestarting"]);
    });

    it("leaves comms alone on an ordinary busy or idle", () => {
      const resets = [];
      kernel.onDidResetComms((reason) => resets.push(reason));
      kernel._wrapComm(fakeComm("c1"));

      session.kernel.status = "busy";
      session.kernel.statusChanged.emit(session.kernel, "busy");
      session.kernel.status = "idle";
      session.kernel.statusChanged.emit(session.kernel, "idle");

      expect(resets).toEqual([]);
      expect(kernel.getComm("c1")).toBeDefined();
    });
  });

  describe("a kernel that is gone", () => {
    it("reports a dead kernel", () => {
      const lost = [];
      kernel.onDidLoseKernel((reason) => lost.push(reason));

      session.kernel.status = "dead";
      session.kernel.statusChanged.emit(session.kernel, "dead");

      expect(lost).toEqual(["The kernel died"]);
      expect(kernel.lifecycle).toBe("dead");
    });

    it("reports a dropped connection", () => {
      const lost = [];
      kernel.onDidLoseKernel((reason) => lost.push(reason));

      session.kernel.connectionStatusChanged.emit(session.kernel, "disconnected");

      expect(lost).toEqual(["The connection to the kernel was lost"]);
    });

    it("reports it once", () => {
      const lost = [];
      kernel.onDidLoseKernel((reason) => lost.push(reason));

      session.kernel.connectionStatusChanged.emit(session.kernel, "disconnected");
      session.kernel.status = "dead";
      session.kernel.statusChanged.emit(session.kernel, "dead");

      expect(lost.length).toBe(1);
    });

    it("says nothing when the connection is only reconnecting", () => {
      const lost = [];
      kernel.onDidLoseKernel((reason) => lost.push(reason));

      session.kernel.connectionStatusChanged.emit(session.kernel, "connecting");

      expect(lost).toEqual([]);
    });

    it("says nothing on a deliberate shutdown", () => {
      const lost = [];
      kernel.onDidLoseKernel((reason) => lost.push(reason));

      kernel.destroy();
      session.kernel.status = "dead";
      session.kernel.statusChanged.emit(session.kernel, "dead");

      expect(lost).toEqual([]);
    });
  });
});
