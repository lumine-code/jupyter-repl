const WSKernel = require("../lib/ws-kernel");

function setup() {
  let resolve;
  let reject;
  const future = {
    msg: { header: { msg_id: "remote_execution" } },
    done: new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  };
  const connection = {
    requestExecute: jasmine.createSpy("requestExecute").and.returnValue(future),
  };
  const kernel = new WSKernel("gateway", { display_name: "Python" }, null, {
    kernel: connection,
  });
  const seen = [];
  const callback = (message, channel) =>
    seen.push({
      type: message.header.msg_type,
      content: message.content,
      channel,
      parent: message.parent_header,
    });
  return { kernel, connection, future, resolve, reject, seen, callback };
}

const reply = { header: { msg_type: "execute_reply" }, content: { status: "ok" } };
const idle = { header: { msg_type: "status" }, content: { execution_state: "idle" } };

describe("remote execution lifetime", () => {
  it("settles a future cancelled by restart using its original request id", async () => {
    const { kernel, reject, seen, callback } = setup();
    kernel.execute("side_effect()", callback);
    reject(new Error("Cancelled future before replies were done"));
    await Promise.resolve();
    expect(seen.map((message) => message.type)).toEqual(["error", "execute_reply", "status"]);
    expect(seen[0].content.ename).toBe("ExecutionOutcomeUnknown");
    expect(seen.every((message) => message.parent.msg_id === "remote_execution")).toBe(true);
  });

  it("preserves the known execution outcome when only idle is missing", async () => {
    const { kernel, future, reject, seen, callback } = setup();
    kernel.execute("1", callback);
    future.onReply(reply);
    reject(new Error("Disconnected before idle"));
    await Promise.resolve();
    expect(seen.map((message) => message.type)).toEqual(["execute_reply", "status"]);
    expect(seen[0].content.status).toBe("ok");
  });

  it("does not duplicate an idle received before cancellation", async () => {
    const { kernel, future, reject, seen, callback } = setup();
    kernel.execute("1", callback);
    future.onIOPub(idle);
    reject(new Error("Disconnected before reply"));
    await Promise.resolve();
    expect(seen.map((message) => message.type)).toEqual(["status", "error", "execute_reply"]);
  });

  it("retains output arriving after the reply and delivers no extra completion", async () => {
    const { kernel, future, resolve, seen, callback } = setup();
    kernel.execute("print(1)", callback);
    future.onReply(reply);
    future.onIOPub({ header: { msg_type: "stream" }, content: { text: "1\n" } });
    future.onIOPub(idle);
    resolve(reply);
    await Promise.resolve();
    expect(seen.map((message) => message.type)).toEqual(["execute_reply", "stream", "status"]);
  });

  it("ignores late messages after the failed execution has settled", async () => {
    const { kernel, future, reject, seen, callback } = setup();
    kernel.execute("1", callback);
    reject(new Error("Cancelled"));
    await Promise.resolve();
    future.onReply(reply);
    future.onIOPub(idle);
    expect(seen.length).toBe(3);
  });

  it("forbids input from background watches and settles their cancelled futures", async () => {
    const { kernel, connection, reject, seen, callback } = setup();
    kernel.executeWatch("input()", callback);
    expect(connection.requestExecute).toHaveBeenCalledWith({
      code: "input()",
      silent: false,
      store_history: false,
      allow_stdin: false,
    });
    reject(new Error("Cancelled"));
    await Promise.resolve();
    expect(seen.map((message) => message.type)).toEqual(["error", "execute_reply", "status"]);
  });

  it("keeps background work local and runs it one at a time after ordered requests", async () => {
    const { kernel, connection, callback } = setup();
    const futures = [];
    connection.requestExecute.and.callFake(() => {
      const future = {};
      futures.push(future);
      return future;
    });
    const codes = () => connection.requestExecute.calls.allArgs().map(([request]) => request.code);
    const complete = async (index) => {
      futures[index].onReply(reply);
      futures[index].onIOPub(idle);
      await Promise.resolve();
    };

    kernel.executeWatch("background 1", callback, { priority: "background" });
    const cancelled = kernel.executeWatch("obsolete", callback, { priority: "background" });
    kernel.executeWatch("background 2", callback, { priority: "background" });
    kernel.executeWatch("ordered query", callback);
    kernel.execute("user cell", callback);
    expect(cancelled.cancelQueued()).toBeTrue();
    await Promise.resolve();
    expect(codes()).toEqual(["ordered query", "user cell"]);
    await complete(0);
    expect(codes()).toEqual(["ordered query", "user cell"]);
    await complete(1);
    expect(codes()).toEqual(["ordered query", "user cell", "background 1"]);
    await complete(2);
    expect(codes()).toEqual(["ordered query", "user cell", "background 1", "background 2"]);
  });

  it("settles unsent background work on connection retirement", async () => {
    const { kernel, connection, seen, callback } = setup();
    kernel.executeWatch("background", callback, { priority: "background" });
    kernel._loseKernel("Connection lost");
    await Promise.resolve();
    expect(connection.requestExecute).not.toHaveBeenCalled();
    expect(seen.map((message) => message.type)).toEqual(["error", "execute_reply", "status"]);
    expect(seen[0].content.ename).toBe("KernelUnresponsive");
  });

  it("settles a synchronous request failure", () => {
    const { kernel, connection, seen, callback } = setup();
    connection.requestExecute.and.throwError("Connection disposed");
    expect(() => kernel.execute("1", callback)).not.toThrow();
    expect(seen.map((message) => message.type)).toEqual(["error", "execute_reply", "status"]);
    expect(seen[0].content.ename).toBe("SendError");
  });

  it("lets the future finish even when a result consumer throws", () => {
    const { kernel, future } = setup();
    kernel.execute("1", () => {
      throw new Error("Broken consumer");
    });
    expect(() => future.onReply(reply)).not.toThrow();
    expect(() => future.onIOPub(idle)).not.toThrow();
  });

  it("does not enqueue more work on a connection known to be lost", () => {
    const { kernel, connection, seen, callback } = setup();
    kernel._lost = true;
    kernel.execute("side_effect()", callback);
    expect(connection.requestExecute).not.toHaveBeenCalled();
    expect(seen.map((message) => message.type)).toEqual(["error", "execute_reply", "status"]);
  });
});
