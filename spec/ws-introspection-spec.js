const WSKernel = require("../lib/ws-kernel");

// JupyterLab rejects an outstanding request rather than answering it whenever
// the session is disposed, the kernel restarts, or the gateway errors — it
// disposes every future with "Canceled future for ... before replies were
// done". Logged and swallowed, as this used to do, that rejection leaves the
// caller's promise pending for the life of the window.
//
// The one path it does not cover is a connection simply dropping: JupyterLab
// gives up reconnecting and reports "disconnected" without disposing the
// futures, so nothing rejects and nothing here fires. The plugin API's timeout
// is what bounds that, and the last spec below pins the gap so it stays a
// known limit rather than looking like an oversight.

function bareKernel(behaviour) {
  // Not the constructor: it wires signal handlers and notifications.
  const kernel = Object.create(WSKernel.prototype);
  kernel.session = { kernel: behaviour };
  return kernel;
}

/** The rejection travels through .then and then .catch, so one tick is not enough. */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

function rejecting(error) {
  return {
    requestComplete: () => Promise.reject(error),
    requestInspect: () => Promise.reject(error),
  };
}

describe("introspection over a websocket", () => {
  it("answers a rejected completion with an error reply on the shell channel", async () => {
    const kernel = bareKernel(rejecting(new Error("Canceled future for complete_request")));
    const seen = [];

    kernel.complete("np.a", (message, channel) => seen.push([message, channel]));
    await flushMicrotasks();

    expect(seen.length).toBe(1);
    const [message, channel] = seen[0];
    expect(channel).toBe("shell");
    expect(message.content.status).toBe("error");
    expect(message.content.evalue).toBe("Canceled future for complete_request");
  });

  it("answers a rejected inspection the same way", async () => {
    const kernel = bareKernel(rejecting(new Error("gateway exploded")));
    const seen = [];

    kernel.inspect("np.array", 8, (message, channel) => seen.push([message, channel]));
    await flushMicrotasks();

    expect(seen.length).toBe(1);
    expect(seen[0][0].header.msg_type).toBe("inspect_reply");
  });

  it("carries the envelope the middleware requires", async () => {
    // protectFromInvalidMessages drops anything missing any of these, and a
    // dropped settle is the hang it was meant to prevent.
    const kernel = bareKernel(rejecting(new Error("nope")));
    let message = null;

    kernel.complete("np.a", (received) => {
      message = received;
    });
    await flushMicrotasks();

    expect(message.header.msg_type).toBe("complete_reply");
    expect(message.parent_header.msg_id).toBeTruthy();
    expect(message.parent_header.msg_type).toBe("complete_request");
    expect(message.content).toBeTruthy();
  });

  it("does not settle twice when the kernel answers normally", async () => {
    const reply = { header: { msg_type: "complete_reply" }, content: { matches: [] } };
    const kernel = bareKernel({ requestComplete: () => Promise.resolve(reply) });
    const seen = [];

    kernel.complete("np.a", (message) => seen.push(message));
    await flushMicrotasks();

    expect(seen).toEqual([reply]);
  });

  it("answers in the documented shape when the session's kernel is gone", async () => {
    // A server-culled session nulls session.kernel; the bare access used to
    // throw a raw TypeError instead of settling the request.
    const kernel = bareKernel(null);
    const seen = [];

    expect(() =>
      kernel.complete("np.a", (message, channel) => seen.push([message, channel])),
    ).not.toThrow();
    await flushMicrotasks();

    expect(seen.length).toBe(1);
    expect(seen[0][1]).toBe("shell");
    expect(seen[0][0].content.status).toBe("error");
  });

  it("leaves a request pending when the connection merely drops", async () => {
    // The known gap: JupyterLab neither answers nor rejects here, so the
    // plugin API's timeout is the only thing that ends the wait.
    const kernel = bareKernel({ requestComplete: () => new Promise(() => {}) });
    const seen = [];

    kernel.complete("np.a", (message) => seen.push(message));
    await flushMicrotasks();

    expect(seen).toEqual([]);
  });
});
