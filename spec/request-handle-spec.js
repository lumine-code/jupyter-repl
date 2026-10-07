const { Emitter, Disposable } = require("lumine");
const KernelTransport = require("../lib/kernel-transport");
const Kernel = require("../lib/kernel");
const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

class RequestTransport extends KernelTransport {
  supportsComms = false;
  requests = [];

  constructor() {
    super({ display_name: "Python", language: "python" }, { name: "Python" });
    this.setLifecycle("ready");
    this.setExecutionState("idle");
  }

  execute(code, receive) {
    const record = { code, receive, queued: false, cancelled: false };
    this.requests.push(record);
    return {
      cancelQueued: () => {
        if (!record.queued) return false;
        record.cancelled = true;
        return true;
      },
    };
  }

  executeWatch(code, receive) {
    return this.execute(code, receive);
  }

  complete(code, receive) {
    const record = { code, receive };
    this.requests.push(record);
    return new Disposable(() => {
      record.receive = null;
    });
  }

  inspect(code, _cursor, receive) {
    return this.complete(code, receive);
  }

  reply(record, type, content, channel = "iopub") {
    record.receive?.(
      {
        header: { msg_id: "reply", msg_type: type },
        parent_header: {
          msg_id: "request",
          msg_type: type === "inspect_reply" ? "inspect_request" : "execute_request",
        },
        content,
      },
      channel,
    );
  }
}

describe("owned Jupyter requests", () => {
  let transport, kernel, session;
  beforeEach(() => {
    transport = new RequestTransport();
    kernel = new Kernel(transport);
    session = kernel.getPluginWrapper();
  });
  afterEach(() => kernel.destroy());

  it("publishes only the session handle and keeps identity after destruction", () => {
    const id = session.id;
    expect(session._kernel).toBeUndefined();
    expect(session.transport).toBeUndefined();
    expect(JupyterKernel.getInternalKernel(session)).toBe(kernel);
    expect(JupyterKernel.isSession(session)).toBe(true);
    kernel.destroy();
    expect(session.id).toBe(id);
    expect(JupyterKernel.getInternalKernel(session)).toBeNull();
    expect(session.displayName).toBe("Python");
    expect(session.isDestroyed()).toBe(true);
    expect(session.connectionState).toBe("dead");
  });

  it("lets subscribers observe synchronous outputs before completion", async () => {
    spyOn(kernel, "execute").and.callFake((_code, receive) => {
      receive({ output_type: "stream", name: "stdout", text: "hello" });
      receive({ stream: "status", data: "ok" });
      receive({ output_type: "status", execution_state: "idle" });
      return { disposeObservation: jasmine.createSpy("dispose observation") };
    });
    const request = session.request({ type: "execute", purpose: "user", code: "print(1)" });
    const output = jasmine.createSpy("output");
    request.onDidOutput(output);
    expect(kernel.execute).not.toHaveBeenCalled();
    expect((await request.done).status).toBe("ok");
    expect(output).toHaveBeenCalledOnceWith({
      output_type: "stream",
      name: "stdout",
      text: "hello",
    });
  });

  it("cancels before sending when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const request = session.request({
      type: "execute",
      purpose: "user",
      code: "side_effect()",
      signal: controller.signal,
    });
    expect((await request.done).status).toBe("cancelled");
    expect(transport.requests.length).toBe(0);
  });

  it("removes a queued execution without interrupting another client's code", async () => {
    const request = session.request({ type: "execute", purpose: "user", code: "side_effect()" });
    await Promise.resolve();
    transport.requests[0].queued = true;
    const interrupt = spyOn(kernel, "interrupt");
    request.dispose();
    expect((await request.done).status).toBe("cancelled");
    expect(transport.requests[0].cancelled).toBe(true);
    expect(kernel._inFlight.size).toBe(0);
    expect(interrupt).not.toHaveBeenCalled();
  });

  it("stops observing sent code and still retires its protocol ledger on idle", async () => {
    const request = session.request({ type: "execute", purpose: "user", code: "slow()" });
    const output = jasmine.createSpy("output");
    request.onDidOutput(output);
    await Promise.resolve();
    const record = transport.requests[0];
    request.dispose();
    const outcome = await request.done;
    transport.reply(record, "stream", { name: "stdout", text: "late" });
    transport.reply(record, "execute_reply", { status: "ok" }, "shell");
    transport.reply(record, "status", { execution_state: "idle" });
    expect(outcome.status).toBe("cancelled");
    expect(outcome.outputs).toEqual([]);
    expect(output).not.toHaveBeenCalled();
    expect(kernel._inFlight.size).toBe(0);
  });

  it("keeps query idle suppression until detached code actually finishes", async () => {
    const request = session.request({ type: "execute", purpose: "query", code: "value" });
    await Promise.resolve();
    request.dispose();
    expect(kernel._watchExecutionDepth).toBe(1);
    expect([...kernel._inFlight.values()][0].observer).toBeNull();
    transport.reply(transport.requests[0], "execute_reply", { status: "ok" }, "shell");
    transport.reply(transport.requests[0], "status", { execution_state: "idle" });
    expect(kernel._watchExecutionDepth).toBe(0);
    expect(kernel._inFlight.size).toBe(0);
  });

  it("exposes count and duration as request state rather than output records", async () => {
    const request = session.request({ type: "execute", purpose: "user", code: "1" });
    const states = [];
    request.onDidChange((state) => states.push(state));
    await Promise.resolve();
    transport.reply(transport.requests[0], "execute_input", { execution_count: 8 });
    window.advanceClock(45);
    transport.reply(transport.requests[0], "execute_reply", { status: "ok" }, "shell");
    transport.reply(transport.requests[0], "status", { execution_state: "idle" });
    const result = await request.done;
    expect(result.executionCount).toBe(8);
    expect(result.durationMs).toBe(45);
    expect(result.outputs).toEqual([]);
    expect(states.map((state) => state.status)).toEqual(["running", "ok"]);
  });

  it("shares notebook output reduction and emits clear/update controls", async () => {
    const request = session.request({ type: "execute", purpose: "user", code: "display(value)" });
    const seen = [];
    request.onDidOutput((output) => seen.push(output.output_type));
    await Promise.resolve();
    const record = transport.requests[0];
    transport.reply(record, "stream", { name: "stdout", text: "discard" });
    transport.reply(record, "clear_output", { wait: true });
    transport.reply(record, "display_data", {
      data: { "text/plain": "old" },
      metadata: {},
      transient: { display_id: "display" },
    });
    transport.reply(record, "update_display_data", {
      data: { "text/plain": "new" },
      metadata: {},
      transient: { display_id: "display" },
    });
    transport.reply(record, "execute_reply", { status: "ok" }, "shell");
    transport.reply(record, "status", { execution_state: "idle" });
    expect(seen).toEqual(["stream", "clear_output", "display_data", "update_display_data"]);
    expect((await request.done).outputs).toEqual([
      {
        output_type: "display_data",
        data: { "text/plain": "new" },
        metadata: {},
        transient: { display_id: "display" },
      },
    ]);
  });

  it("streams without retaining another output history when collection is disabled", async () => {
    const request = session.request({
      type: "execute",
      purpose: "user",
      code: "stream_forever()",
      collectOutputs: false,
    });
    let observed = 0;
    request.onDidOutput(() => {
      observed++;
    });
    await Promise.resolve();
    const record = transport.requests[0];
    for (let index = 0; index < 1000; index++)
      transport.reply(record, "stream", { name: "stdout", text: "x".repeat(1000) });
    transport.reply(record, "error", { ename: "Interrupted", evalue: "Stopped", traceback: [] });
    transport.reply(record, "execute_reply", { status: "error" }, "shell");
    transport.reply(record, "status", { execution_state: "idle" });
    const outcome = await request.done;
    expect(observed).toBe(1001);
    expect(outcome.outputs).toEqual([]);
    expect(outcome.status).toBe("error");
    expect(outcome.error.ename).toBe("Interrupted");
  });

  it("changes generation, retires old work and refuses an unavailable connection", async () => {
    const request = session.request({ type: "complete", purpose: "query", code: "value" });
    const generations = [];
    session.onDidChangeGeneration((generation) => generations.push(generation));
    await Promise.resolve();
    transport.emitDidResetComms("Kernel restarted");
    expect((await request.done).status).toBe("unavailable");
    expect(transport.requests[0].receive).toBeNull();
    expect(session.generation).toBe(request.generation + 1);
    expect(generations).toEqual([session.generation]);
    transport.setLifecycle("recovering");
    const unavailable = session.request({
      type: "execute",
      purpose: "user",
      code: "side_effect()",
    });
    expect((await unavailable.done).status).toBe("unavailable");
    expect(transport.requests.length).toBe(1);
  });

  it("preserves the inspect payload inside the request result data", async () => {
    const request = session.request({
      type: "inspect",
      purpose: "query",
      code: "value",
      cursorPos: 5,
    });
    await Promise.resolve();
    transport.reply(
      transport.requests[0],
      "inspect_reply",
      { data: { "text/plain": "docs" }, found: true, metadata: { origin: "kernel" } },
      "shell",
    );
    const result = await request.done;
    expect(result.status).toBe("ok");
    expect(result.data).toEqual({
      data: { "text/plain": "docs" },
      found: true,
      metadata: { origin: "kernel" },
    });
  });

  it("preserves precise transport outcomes emitted immediately after generation reset", async () => {
    const request = session.request({ type: "execute", purpose: "user", code: "side_effect()" });
    await Promise.resolve();
    transport.emitDidResetComms("Kernel restarted");
    const record = transport.requests[0];
    transport.reply(record, "error", {
      ename: "ExecutionOutcomeUnknown",
      evalue: "Unacknowledged execution",
      traceback: [],
    });
    transport.reply(record, "execute_reply", { status: "error" }, "shell");
    transport.reply(record, "status", { execution_state: "idle" });
    const result = await request.done;
    expect(result.status).toBe("unknown");
    expect(result.error.ename).toBe("ExecutionOutcomeUnknown");
  });

  it("invalidates requests on destruction and settles later requests without throwing", async () => {
    const emitter = new Emitter();
    const silent = new JupyterKernel({ id: "retired", emitter, complete() {} });
    const first = silent.request({
      type: "complete",
      purpose: "query",
      code: "value",
      timeoutMs: 0,
    });
    await Promise.resolve();
    emitter.emit("did-destroy");
    expect((await first.done).status).toBe("unavailable");
    const later = silent.request({ type: "complete", purpose: "query", code: "value" });
    expect((await later.done).status).toBe("unavailable");
    emitter.dispose();
  });
});
