const { CommRegistry, fromWireBuffers, toWireBuffers } = require("../lib/comm");

// A comm is the first thing this package carries that outlives the request
// which created it, so the registry owns lifetimes nothing else here has to
// think about. Three of the behaviours below are deliberate divergences from
// what JupyterLab's client does, and each one is a decision that would look
// like a bug to someone reading only the protocol spec:
//
//   - an unclaimed target is dropped, never closed (the kernel may be shared),
//   - clear() keeps the target claims (a restart replaces the process, not our
//     interest in its targets),
//   - dispatch is serialized (an open handler is async, and a message for a
//     model whose open has not resolved would otherwise be lost).

/** A registry over a driver that records what it was asked to send. */
function build() {
  const sent = [];
  const registry = new CommRegistry({
    send: (msgType, content, metadata, buffers) => {
      sent.push({ msgType, content, metadata, buffers });
      return `msg_${sent.length}`;
    },
  });
  return { registry, sent };
}

function openMessage(commId, targetName = "jupyter.widget", data = {}) {
  return {
    header: { msg_id: `open_${commId}`, msg_type: "comm_open" },
    parent_header: {},
    content: { comm_id: commId, target_name: targetName, data },
  };
}

function msgMessage(commId, data = {}) {
  return {
    header: { msg_id: `msg_${commId}`, msg_type: "comm_msg" },
    parent_header: {},
    content: { comm_id: commId, data },
  };
}

function closeMessage(commId) {
  return {
    header: { msg_id: `close_${commId}`, msg_type: "comm_close" },
    parent_header: {},
    content: { comm_id: commId, data: {} },
  };
}

/** Let the registry's dispatch chain drain. */
async function settle() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("CommRegistry", () => {
  describe("targets", () => {
    it("hands a claimed target its comm and the raw open message", async () => {
      const { registry } = build();
      const opened = [];
      registry.registerTarget("jupyter.widget", (comm, message) => opened.push({ comm, message }));

      registry.handleIOPubMessage(openMessage("c1"));
      await settle();

      expect(opened.length).toBe(1);
      expect(opened[0].comm.comm_id).toBe("c1");
      expect(opened[0].comm.target_name).toBe("jupyter.widget");
      expect(opened[0].message.content.target_name).toBe("jupyter.widget");
      expect(registry.getComm("c1")).toBe(opened[0].comm);
    });

    it("drops an unclaimed target without closing it", async () => {
      // JupyterLab replies to an unclaimed target with a comm_close. This
      // kernel may be shared with a jupyter console or a second window, where
      // that would destroy another client's live comm.
      const { registry, sent } = build();

      registry.handleIOPubMessage(openMessage("c1", "someone.elses.target"));
      await settle();

      expect(sent.length).toBe(0);
      expect(registry.getComm("c1")).toBeUndefined();
    });

    it("forgets a comm whose target handler threw", async () => {
      const { registry } = build();
      registry.registerTarget("jupyter.widget", () => {
        throw new Error("no widget class");
      });

      registry.handleIOPubMessage(openMessage("c1"));
      await settle();

      expect(registry.getComm("c1")).toBeUndefined();
    });

    it("disposes a target claim", async () => {
      const { registry } = build();
      const opened = [];
      const claim = registry.registerTarget("jupyter.widget", (comm) => opened.push(comm));

      claim.dispose();
      registry.handleIOPubMessage(openMessage("c1"));
      await settle();

      expect(opened.length).toBe(0);
    });
  });

  describe("dispatch", () => {
    it("routes a comm_msg to its own comm", async () => {
      const { registry } = build();
      const received = [];
      registry.registerTarget("jupyter.widget", (comm) => {
        comm.on_msg((message) => received.push(message.content.data));
      });

      registry.handleIOPubMessage(openMessage("c1"));
      registry.handleIOPubMessage(msgMessage("c1", { value: 7 }));
      await settle();

      expect(received).toEqual([{ value: 7 }]);
    });

    it("delivers a comm_msg that arrives while its open is still pending", async () => {
      // The open handler is async — the real one awaits the widget class — and
      // the kernel sends the first state update immediately after the open.
      const { registry } = build();
      const received = [];
      let releaseOpen;
      const openHasStarted = new Promise((resolve) => {
        registry.registerTarget("jupyter.widget", async (comm) => {
          resolve();
          await new Promise((r) => {
            releaseOpen = r;
          });
          comm.on_msg((message) => received.push(message.content.data));
        });
      });

      registry.handleIOPubMessage(openMessage("c1"));
      await openHasStarted;
      registry.handleIOPubMessage(msgMessage("c1", { value: 7 }));
      await settle();

      // Still inside the open handler: the message must not have been dropped.
      expect(received).toEqual([]);

      releaseOpen();
      await settle();

      expect(received).toEqual([{ value: 7 }]);
    });

    it("drops a message for a comm it does not know", async () => {
      const { registry } = build();

      registry.handleIOPubMessage(msgMessage("never-opened", { value: 1 }));
      await settle();

      expect(registry.getComm("never-opened")).toBeUndefined();
    });

    it("drops a comm message with no comm_id", async () => {
      const { registry } = build();
      const message = msgMessage("c1");
      delete message.content.comm_id;

      registry.handleIOPubMessage(message);
      await settle();

      // Reaching here without throwing is the assertion.
      expect(registry.getComm("c1")).toBeUndefined();
    });

    it("runs the close handler and forgets the comm", async () => {
      const { registry } = build();
      const closed = [];
      registry.registerTarget("jupyter.widget", (comm) => {
        comm.on_close(() => closed.push(comm.comm_id));
      });

      registry.handleIOPubMessage(openMessage("c1"));
      registry.handleIOPubMessage(closeMessage("c1"));
      await settle();

      expect(closed).toEqual(["c1"]);
      expect(registry.getComm("c1")).toBeUndefined();
    });

    it("keeps dispatching after a handler rejects", async () => {
      const { registry } = build();
      const received = [];
      registry.registerTarget("jupyter.widget", (comm) => {
        comm.on_msg((message) => {
          if (message.content.data.boom) {
            throw new Error("handler failed");
          }
          received.push(message.content.data);
        });
      });

      registry.handleIOPubMessage(openMessage("c1"));
      registry.handleIOPubMessage(msgMessage("c1", { boom: true }));
      registry.handleIOPubMessage(msgMessage("c1", { value: 2 }));
      await settle();

      expect(received).toEqual([{ value: 2 }]);
    });
  });

  describe("sending", () => {
    it("opens a comm this side initiates only when asked", () => {
      const { registry, sent } = build();
      const comm = registry.createComm("jupyter.widget", "c1");

      expect(sent.length).toBe(0);

      comm.open({ state: {} });

      expect(sent.length).toBe(1);
      expect(sent[0].msgType).toBe("comm_open");
      expect(sent[0].content).toEqual({
        comm_id: "c1",
        target_name: "jupyter.widget",
        data: { state: {} },
      });
    });

    it("returns the message id synchronously", () => {
      const { registry } = build();
      const comm = registry.createComm("jupyter.widget", "c1");

      // IClassicComm's contract: ipywidgets uses the returned id to correlate
      // its own echoes, so this cannot become a promise.
      expect(typeof comm.send({ value: 1 })).toBe("string");
    });

    it("closes once and unregisters", () => {
      const { registry, sent } = build();
      const comm = registry.createComm("jupyter.widget", "c1");

      comm.close();
      comm.close();

      expect(sent.filter((s) => s.msgType === "comm_close").length).toBe(1);
      expect(registry.getComm("c1")).toBeUndefined();
    });

    it("ignores a send on a closed comm", () => {
      const { registry, sent } = build();
      const comm = registry.createComm("jupyter.widget", "c1");

      comm.close();
      sent.length = 0;
      comm.send({ value: 1 });

      expect(sent.length).toBe(0);
    });
  });

  describe("reset", () => {
    it("drops comms and keeps target claims", async () => {
      // A restart replaces the process, not our interest in its targets: the
      // new process must find jupyter.widget already claimed.
      const { registry } = build();
      const opened = [];
      const closed = [];
      registry.registerTarget("jupyter.widget", (comm) => {
        opened.push(comm.comm_id);
        comm.on_close(() => closed.push(comm.comm_id));
      });

      registry.handleIOPubMessage(openMessage("c1"));
      await settle();

      registry.clear("Kernel restarted");

      expect(closed).toEqual(["c1"]);
      expect(registry.getComm("c1")).toBeUndefined();

      registry.handleIOPubMessage(openMessage("c2"));
      await settle();

      expect(opened).toEqual(["c1", "c2"]);
    });

    it("sends nothing when it drops comms", () => {
      // There is no process left to close against, and on a shared kernel the
      // comm may not even be ours.
      const { registry, sent } = build();
      registry.registerTarget("jupyter.widget", () => {});
      registry.createComm("jupyter.widget", "c1");
      sent.length = 0;

      registry.clear("Kernel restarted");

      expect(sent.length).toBe(0);
    });

    it("drops targets too on dispose", async () => {
      const { registry } = build();
      const opened = [];
      registry.registerTarget("jupyter.widget", (comm) => opened.push(comm.comm_id));

      registry.dispose();
      registry.handleIOPubMessage(openMessage("c1"));
      await settle();

      expect(opened).toEqual([]);
    });
  });

  describe("buffers", () => {
    it("round-trips a view that is a window onto a larger allocation", () => {
      // A Node Buffer is a window onto a shared pool — `Buffer.from([…])` alone
      // already lands at a non-zero offset — so a naive `new DataView(buf.buffer)`
      // would hand out unrelated memory rather than this message's payload.
      const pool = Buffer.from([9, 9, 9, 1, 2, 3, 4]);
      const frame = pool.subarray(3);
      expect(frame.byteOffset).toBeGreaterThan(0);
      expect(frame.buffer.byteLength).toBeGreaterThan(frame.byteLength);

      const [view] = fromWireBuffers([frame]);

      expect(view instanceof DataView).toBe(true);
      expect(view.byteLength).toBe(4);
      expect([0, 1, 2, 3].map((i) => view.getUint8(i))).toEqual([1, 2, 3, 4]);
    });

    it("converts an ArrayBuffer for the wire", () => {
      // zeromq refuses a bare ArrayBuffer, which is what ipywidgets produces.
      const source = Uint8Array.from([1, 2, 3]);

      const [out] = toWireBuffers([source.buffer]);

      expect(Buffer.isBuffer(out)).toBe(true);
      expect([...out]).toEqual([1, 2, 3]);
    });

    it("keeps a view's own window when converting for the wire", () => {
      const pool = Uint8Array.from([9, 9, 1, 2, 3]);
      const view = new DataView(pool.buffer, 2, 3);

      const [out] = toWireBuffers([view]);

      expect([...out]).toEqual([1, 2, 3]);
    });

    it("leaves an empty buffer list alone in both directions", () => {
      expect(fromWireBuffers([])).toEqual([]);
      expect(toWireBuffers([])).toEqual([]);
      expect(fromWireBuffers(undefined)).toEqual([]);
      expect(toWireBuffers(undefined)).toEqual([]);
    });
  });
});
