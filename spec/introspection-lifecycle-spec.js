const Kernel = require("../lib/kernel");
const KernelTransport = require("../lib/kernel-transport");

// `complete` and `inspect` register one callback for the whole request, so the
// kernel's busy/idle pair reaches it alongside the reply it asked for. Only the
// shell reply carries an answer; the guard that drops the rest is load-bearing,
// because the caller resolves on the first thing it is handed — a busy status
// getting through would resolve every completion with no matches at all.

// The transport is fed messages by hand. They carry the full envelope a kernel
// would send, so they pass the middleware's message validation.
class FakeTransport extends KernelTransport {
  constructor() {
    super({ language: "python", display_name: "Python 3" }, null);
  }

  complete(code, onResults) {
    this.completeOnResults = onResults;
  }

  inspect(code, cursorPos, onResults) {
    this.inspectOnResults = onResults;
  }

  deliverCompleteReply(content) {
    this.completeOnResults(
      {
        header: { msg_id: "re", msg_type: "complete_reply" },
        parent_header: { msg_id: "complete_1", msg_type: "complete_request" },
        content,
      },
      "shell",
    );
  }

  deliverInspectReply(content) {
    this.inspectOnResults(
      {
        header: { msg_id: "re", msg_type: "inspect_reply" },
        parent_header: { msg_id: "inspect_1", msg_type: "inspect_request" },
        content,
      },
      "shell",
    );
  }

  /** The busy/idle pair the kernel publishes around any shell message. */
  deliverStatus(onResults, state, requestType, requestId) {
    onResults(
      {
        header: { msg_id: `st_${state}`, msg_type: "status" },
        parent_header: { msg_id: requestId, msg_type: requestType },
        content: { execution_state: state },
      },
      "iopub",
    );
  }
}

describe("introspection at the kernel facade", () => {
  let transport;
  let kernel;

  beforeEach(() => {
    transport = new FakeTransport();
    kernel = new Kernel(transport);
  });

  afterEach(() => {
    kernel.destroy();
  });

  describe("complete", () => {
    it("hands the reply content to the caller", () => {
      const seen = [];
      kernel.complete("np.a", (results) => seen.push(results));

      transport.deliverCompleteReply({ matches: ["np.array"], cursor_start: 0, cursor_end: 4 });

      expect(seen.length).toBe(1);
      expect(seen[0].matches).toEqual(["np.array"]);
    });

    it("ignores the status pair the kernel publishes around the reply", () => {
      // The caller resolves on the first callback it gets, so a status
      // reaching it would resolve the completion with no matches.
      const seen = [];
      kernel.complete("np.a", (results) => seen.push(results));

      transport.deliverStatus(
        transport.completeOnResults,
        "busy",
        "complete_request",
        "complete_1",
      );
      transport.deliverStatus(
        transport.completeOnResults,
        "idle",
        "complete_request",
        "complete_1",
      );

      expect(seen).toEqual([]);
    });

    it("still answers once the reply follows the status pair", () => {
      const seen = [];
      kernel.complete("np.a", (results) => seen.push(results));

      transport.deliverStatus(
        transport.completeOnResults,
        "busy",
        "complete_request",
        "complete_1",
      );
      transport.deliverCompleteReply({ matches: ["np.array"] });
      transport.deliverStatus(
        transport.completeOnResults,
        "idle",
        "complete_request",
        "complete_1",
      );

      expect(seen.length).toBe(1);
      expect(seen[0].matches).toEqual(["np.array"]);
    });

    it("passes a synthesized error reply through as content", () => {
      // What the transport sends when it gives up on a request: the caller
      // needs it to arrive, so its promise settles instead of hanging.
      const seen = [];
      kernel.complete("np.a", (results) => seen.push(results));

      transport.deliverCompleteReply({
        status: "error",
        ename: "NoReplyError",
        evalue: "Kernel restarted",
        traceback: [],
      });

      expect(seen.length).toBe(1);
      expect(seen[0].status).toBe("error");
    });
  });

  describe("inspect", () => {
    it("hands the documentation to the caller", () => {
      const seen = [];
      kernel.inspect("np.array", 8, (results) => seen.push(results));

      transport.deliverInspectReply({ found: true, data: { "text/plain": "array(...)" } });

      expect(seen.length).toBe(1);
      expect(seen[0].found).toBe(true);
      expect(seen[0].data["text/plain"]).toBe("array(...)");
    });

    it("ignores the status pair the kernel publishes around the reply", () => {
      const seen = [];
      kernel.inspect("np.array", 8, (results) => seen.push(results));

      transport.deliverStatus(transport.inspectOnResults, "busy", "inspect_request", "inspect_1");
      transport.deliverStatus(transport.inspectOnResults, "idle", "inspect_request", "inspect_1");

      expect(seen).toEqual([]);
    });

    it("reports why it failed rather than reporting nothing found", () => {
      // `{found: false}` alone is what the kernel says when it looked and knows
      // nothing about the name. A kernel that went away mid-request must not
      // be indistinguishable from that — the MCP inspect tool relays it to an
      // assistant as a fact about the code.
      const seen = [];
      kernel.inspect("np.array", 8, (results) => seen.push(results));

      transport.deliverInspectReply({
        status: "error",
        ename: "KernelGone",
        evalue: "Kernel restarted",
        traceback: [],
      });

      expect(seen.length).toBe(1);
      expect(seen[0].status).toBe("error");
      expect(seen[0].evalue).toBe("Kernel restarted");
      expect(seen[0].found).toBeFalsy();
    });
  });

  describe("shutting down through the facade", () => {
    // The seam every UI path crosses: shutdown must finish before destroy
    // kills the process, however many times it is asked, and a transport
    // that never answers must not hold the teardown hostage.
    it("waits for the transport's shutdown before destroying", async () => {
      let finish;
      transport.shutdown = () => new Promise((resolve) => (finish = resolve));
      spyOn(transport, "destroy").and.callThrough();

      const done = kernel.shutdownAndDestroy();
      await Promise.resolve();
      expect(transport.destroy).not.toHaveBeenCalled();

      finish();
      await done;
      expect(transport.destroy).toHaveBeenCalled();
    });

    it("asks the transport once however many times it is called", async () => {
      let calls = 0;
      let finish;
      transport.shutdown = () => {
        calls++;
        return new Promise((resolve) => (finish = resolve));
      };

      const first = kernel.shutdownAndDestroy();
      const second = kernel.shutdownAndDestroy();
      expect(second).toBe(first);

      finish();
      await first;
      expect(calls).toBe(1);
    });

    it("tears down anyway when the shutdown never settles", async () => {
      // A WS session shutdown is an HTTP DELETE with no timeout of its own;
      // against an unreachable gateway the kernel stayed listed and
      // file-mapped until the network stack gave up.
      transport.shutdown = () => new Promise(() => {});
      spyOn(transport, "destroy").and.callThrough();

      const done = kernel.shutdownAndDestroy();
      await Promise.resolve();
      expect(transport.destroy).not.toHaveBeenCalled();

      window.advanceClock(Kernel.SHUTDOWN_DESTROY_TIMEOUT_MS);
      await done;
      expect(transport.destroy).toHaveBeenCalled();
    });
  });

  describe("a middleware that answers twice", () => {
    it("reaches the caller once", () => {
      // The transports answer once; a plugin's middleware is under no such
      // obligation, and the caller resolves a promise on the first answer.
      const seen = [];
      kernel.complete("np.a", (results) => seen.push(results));

      transport.deliverCompleteReply({ matches: ["np.array"] });
      transport.deliverCompleteReply({ matches: ["np.arange"] });

      expect(seen.length).toBe(1);
      expect(seen[0].matches).toEqual(["np.array"]);
    });
  });
});
