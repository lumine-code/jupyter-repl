const { randomUUID } = require("node:crypto");

async function flush() {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
async function rejected(promise, code) {
  try {
    await promise;
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error.code).toBe(code);
  }
}

describe("Jupyter MCP execution receipts", () => {
  let runtime;
  let Runtime;
  let ledger;
  let context;
  let kernel;
  let sends;
  let notebook;
  let adapter;
  let resets;
  beforeEach(() => {
    jasmine.useRealClock();
    const module = require("../lib/mcp-execution");
    Runtime = module.McpExecutionRuntime;
    ledger = module.createLedger();
    sends = [];
    resets = new Set();
    kernel = {
      id: "kernel-1",
      language: "python",
      executionState: "idle",
      interrupt: jasmine.createSpy("interrupt"),
      restart: jasmine.createSpy("restart").and.callFake(async () => {
        for (const reset of resets) reset();
        return true;
      }),
      transport: {
        onDidResetComms(callback) {
          resets.add(callback);
          return { dispose: () => resets.delete(callback) };
        },
      },
    };
    notebook = {
      notebookId: "document-id",
      revision: "revision-1",
      cells: [
        { cellId: "cell-a", type: "code", source: "a()", sourceRevision: 0 },
        { cellId: "cell-b", type: "code", source: "b()", sourceRevision: 0 },
      ],
    };
    adapter = {
      binding: kernel,
      getRunTarget(id) {
        const cell = notebook.cells.find((entry) => entry.cellId === id);
        return cell && { id, source: cell.source, type: cell.type };
      },
      getTarget(id) {
        return notebook.cells.find((entry) => entry.cellId === id);
      },
    };
    const run = (source, observe) =>
      new Promise((resolve) => sends.push({ source, observe, resolve }));
    context = {
      getStore: () => ({ runningKernels: [kernel], getFilesForKernel: () => [] }),
      getNotebookService: () => ({
        getExecutionSnapshot: async () => JSON.parse(JSON.stringify(notebook)),
        getNotebookRevision: () => notebook.revision,
        getExecutionAdapter: () => adapter,
      }),
      getIntegration: () => ({ getKernelForAdapter: (value) => value.binding }),
      getAdapterServices: () => [],
      runCode: (_kernel, code, observe) => run(code, observe),
      runTarget: (_services, _adapter, _kernel, target, observe) => run(target.id, observe),
    };
    context.getIntegration = () => ({
      getKernelForAdapter: (value) => value.binding,
      async bindExistingAdapterKernel(_services, value, candidate, onBinding) {
        if (value.binding === candidate) return true;
        if (value.binding?.executionState === "busy") {
          const error = new Error("The existing binding is busy.");
          error.code = "kernel_binding_busy";
          throw error;
        }
        onBinding?.();
        value.binding = candidate;
        notebook.revision = "revision-bound";
        return true;
      },
    });
    runtime = new Runtime(context, ledger);
  });
  afterEach(() => {
    runtime.dispose();
    for (const send of sends) send.resolve({ status: "ok", success: true });
  });
  const codeArgs = (operationId = "op") => ({
    kernelId: "kernel-1",
    operationId,
    code: "print('hello')",
  });
  const notebookArgs = (operationId = "book") => ({
    kernelId: "kernel-1",
    operationId,
    notebookId: "document-id",
    expectedRevision: "revision-1",
  });

  it("requires an explicit existing kernel and does not fall back to the active one", async () => {
    expect(runtime.listKernels({}).kernels[0].kernelId).toBe("kernel-1");
    const receipt = await runtime.executeCode({ ...codeArgs(), kernelId: "missing" });
    expect(receipt.accepted).toBe(false);
    expect(receipt.error.code).toBe("kernel_not_found");
    expect(sends.length).toBe(0);
    await rejected(
      runtime.executeCode({ operationId: "no-kernel", code: "x" }),
      "invalid_arguments",
    );
  });

  it("accepts once and returns the same receipt for concurrent retries", async () => {
    const [first, again] = await Promise.all([
      runtime.executeCode(codeArgs()),
      runtime.executeCode(codeArgs()),
    ]);
    await flush();
    expect(first.executionId).toBe(again.executionId);
    expect(again.alreadyAccepted).toBe(true);
    expect(sends.length).toBe(1);
    await rejected(
      runtime.executeCode({ ...codeArgs(), code: "different()" }),
      "operation_conflict",
    );
  });

  it("reserves notebook operationId before waiting for source synchronization", async () => {
    let resolve;
    const ready = new Promise((done) => {
      resolve = done;
    });
    context.getNotebookService = () => ({
      getExecutionSnapshot: () => ready,
      getNotebookRevision: () => notebook.revision,
      getExecutionAdapter: () => adapter,
    });
    const first = runtime.runCell({ ...notebookArgs(), cellId: "cell-a" });
    const again = runtime.runCell({ ...notebookArgs(), cellId: "cell-a" });
    expect(ledger.operations.size).toBe(1);
    expect(sends.length).toBe(0);
    resolve(JSON.parse(JSON.stringify(notebook)));
    const replies = await Promise.all([first, again]);
    await flush();
    expect(replies[0].executionId).toBe(replies[1].executionId);
    expect(sends.length).toBe(1);
  });

  it("reports request-specific progress and cloned, bounded summaries without rich payload bytes", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    const output = {
      output_type: "display_data",
      data: { "text/plain": "hello", "image/png": "X".repeat(1000000) },
      metadata: { "image/png": { width: 100 } },
    };
    sends[0].observe({ stream: "execution_count", data: 19 });
    sends[0].observe(output);
    for (let index = 0; index < 100; index++)
      sends[0].observe({ output_type: "stream", name: "stdout", text: "z".repeat(4000) });
    const snapshot = await runtime.getExecution({ executionId: receipt.executionId });
    expect(snapshot.state).toBe("running");
    expect(snapshot.executionCount).toBe(19);
    expect(snapshot.outputs[0].mimeTypes).toEqual(["text/plain", "image/png"]);
    expect(snapshot.outputs.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(snapshot).length).toBeLessThan(30000);
    expect(JSON.stringify(snapshot)).not.toContain("X".repeat(100));
    expect(snapshot.outputsTruncated).toBe(true);
    output.data["text/plain"] = "mutated";
    snapshot.outputs[0].text = "caller mutation";
    expect((await runtime.getExecution({ executionId: receipt.executionId })).outputs[0].text).toBe(
      "hello",
    );
  });

  it("cancels only an observation and keeps the accepted execution running", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    const controller = new AbortController();
    const observation = runtime.getExecution(
      { executionId: receipt.executionId, waitMs: 10000 },
      { signal: controller.signal },
    );
    controller.abort();
    await rejected(observation, "observation_cancelled");
    expect(runtime.waiters.size).toBe(0);
    expect(kernel.interrupt).not.toHaveBeenCalled();
    expect((await runtime.getExecution({ executionId: receipt.executionId })).state).toBe("queued");
    sends[0].resolve({ status: "ok", success: true });
    await flush();
    expect((await runtime.getExecution({ executionId: receipt.executionId })).state).toBe("done");
  });

  it("caps concurrent waits and frees observation quota after cancellation without interrupting code", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    const waits = controllers.map((controller) =>
      runtime.getExecution(
        { executionId: receipt.executionId, waitMs: 10000 },
        { signal: controller.signal },
      ),
    );
    const settled = Promise.allSettled(waits);
    expect(runtime.pendingWaits).toBe(8);
    await rejected(
      runtime.getExecution({ executionId: receipt.executionId, waitMs: 10000 }),
      "too_many_waits",
    );
    expect(runtime.pendingWaits).toBe(8);
    controllers[0].abort();
    await flush();
    expect(runtime.pendingWaits).toBe(7);
    await runtime.getExecution({ executionId: receipt.executionId, waitMs: 1 });
    expect(runtime.pendingWaits).toBe(7);
    expect(kernel.interrupt).not.toHaveBeenCalled();
    expect(sends.length).toBe(1);
    for (const controller of controllers) controller.abort();
    await settled;
    expect(runtime.pendingWaits).toBe(0);
    expect(runtime.waiters.size).toBe(0);
  });

  it("releases all observation quota on provider teardown", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    const waits = Array.from({ length: 8 }, () =>
      runtime.getExecution({ executionId: receipt.executionId, waitMs: 10000 }),
    );
    expect(runtime.pendingWaits).toBe(8);
    runtime.dispose();
    const results = await Promise.all(waits);
    expect(results.every((record) => record.state === "error")).toBe(true);
    expect(runtime.pendingWaits).toBe(0);
    expect(runtime.waiters.size).toBe(0);
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("bounds observation time without claiming cancellation or replaying work", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    const snapshot = await runtime.getExecution({ executionId: receipt.executionId, waitMs: 5 });
    expect(snapshot.state).toBe("queued");
    await runtime.executeCode(codeArgs());
    expect(sends.length).toBe(1);
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("refuses cancelled acceptance but ignores request abort after acceptance", async () => {
    const before = new AbortController();
    before.abort();
    await rejected(
      runtime.executeCode(codeArgs(), { signal: before.signal }),
      "observation_cancelled",
    );
    expect(ledger.operations.size).toBe(0);
    const after = new AbortController();
    await runtime.executeCode(codeArgs(), { signal: after.signal });
    after.abort();
    await flush();
    expect(sends.length).toBe(1);
    expect(kernel.interrupt).not.toHaveBeenCalled();
  });

  it("rejects stale notebook revision and a kernel bound to another notebook", async () => {
    const stale = await runtime.runCell({
      ...notebookArgs(),
      expectedRevision: "old",
      cellId: "cell-a",
    });
    expect(stale.accepted).toBe(false);
    expect(stale.error.code).toBe("source_revision_conflict");
    adapter.binding = { id: "other" };
    const foreign = await runtime.runCell({ ...notebookArgs("foreign"), cellId: "cell-a" });
    expect(foreign.error.code).toBe("kernel_not_bound");
    expect(sends.length).toBe(0);
  });

  it("binds an existing kernel, exposes the updated revision and runs the new notebook cell", async () => {
    adapter.binding = null;
    const receipt = await runtime.bindNotebookKernel(notebookArgs("bind"));
    await flush();
    const completed = await runtime.getExecution({ executionId: receipt.executionId });
    expect(completed.state).toBe("done");
    expect(completed.binding).toEqual({
      notebookId: "document-id",
      kernelId: kernel.id,
      revision: "revision-bound",
    });
    const retry = await runtime.bindNotebookKernel(notebookArgs("bind"));
    expect(retry.executionId).toBe(receipt.executionId);
    const run = await runtime.runCell({
      ...notebookArgs("run-bound"),
      expectedRevision: completed.binding.revision,
      cellId: "cell-a",
    });
    await flush();
    expect(run.accepted).toBe(true);
    expect(sends[0].source).toBe("cell-a");
  });

  it("keeps same-kernel binding idempotent without changing the notebook revision", async () => {
    const receipt = await runtime.bindNotebookKernel(notebookArgs("same-binding"));
    await flush();
    const completed = await runtime.getExecution({ executionId: receipt.executionId });
    expect(completed.state).toBe("done");
    expect(completed.notebookRevision).toBe("revision-1");
    expect(completed.dispatched).toBe(false);
    expect(sends.length).toBe(0);
  });

  it("refuses replacing a busy binding and rejects stale revision before binding", async () => {
    const old = { id: "old", executionState: "busy" };
    adapter.binding = old;
    const busy = await runtime.bindNotebookKernel(notebookArgs("busy-binding"));
    await flush();
    expect((await runtime.getExecution({ executionId: busy.executionId })).error.code).toBe(
      "kernel_binding_busy",
    );
    expect(adapter.binding).toBe(old);
    const stale = await runtime.bindNotebookKernel({
      ...notebookArgs("stale-binding"),
      expectedRevision: "old-revision",
    });
    expect(stale.accepted).toBe(false);
    expect(stale.error.code).toBe("source_revision_conflict");
    expect(adapter.binding).toBe(old);
  });

  it("keeps stable cell IDs across reorder and stops before changed queued source", async () => {
    const receipt = await runtime.runNotebook(notebookArgs());
    await flush();
    expect(sends[0].source).toBe("cell-a");
    notebook.cells.reverse();
    notebook.cells[0].source = "changed()";
    notebook.cells[0].sourceRevision++;
    sends[0].resolve({ status: "ok", success: true });
    await flush();
    expect(sends.length).toBe(1);
    const record = await runtime.getExecution({ executionId: receipt.executionId });
    expect(record.state).toBe("error");
    expect(record.error.code).toBe("cell_source_changed");
    expect(record.cells[0].state).toBe("done");
    expect(record.cells[1].state).toBe("skipped");
  });

  it("allows an unchanged notebook reorder without substituting current indices", async () => {
    const receipt = await runtime.runNotebook(notebookArgs());
    await flush();
    notebook.cells.reverse();
    sends[0].resolve({ status: "ok", success: true });
    await flush();
    expect(sends[1].source).toBe("cell-b");
    sends[1].resolve({ status: "ok", success: true });
    await flush();
    expect((await runtime.getExecution({ executionId: receipt.executionId })).state).toBe("done");
  });

  it("keeps clear_output scoped to its notebook cell, including deferred clears", async () => {
    const receipt = await runtime.runNotebook(notebookArgs());
    await flush();
    sends[0].observe({ output_type: "stream", text: "first", name: "stdout" });
    sends[0].resolve({ status: "ok", success: true });
    await flush();
    sends[1].observe({ output_type: "stream", text: "replace", name: "stdout" });
    sends[1].observe({ output_type: "clear_output", wait: true });
    sends[1].observe({ output_type: "stream", text: "second", name: "stdout" });
    const record = await runtime.getExecution({ executionId: receipt.executionId });
    expect(record.outputs.map((output) => output.text)).toEqual(["first", "second"]);
    expect(record.outputs.map((output) => output.cellId)).toEqual(["cell-a", "cell-b"]);
  });

  it("interrupts on its own control lane while execution is waiting, once per operationId", async () => {
    await runtime.executeCode(codeArgs());
    await flush();
    const args = { kernelId: kernel.id, operationId: "interrupt" };
    const first = await runtime.interruptKernel(args);
    await flush();
    const again = await runtime.interruptKernel(args);
    expect(kernel.interrupt.calls.count()).toBe(1);
    expect(first.executionId).toBe(again.executionId);
    expect(sends.length).toBe(1);
  });

  it("never dispatches accepted queued code into a replacement kernel session", async () => {
    await runtime.executeCode(codeArgs("first"));
    await flush();
    const second = await runtime.executeCode(codeArgs("second"));
    for (const reset of resets) reset();
    sends[0].resolve({ status: "ok", success: true });
    await flush();
    expect(sends.length).toBe(1);
    expect((await runtime.getExecution({ executionId: second.executionId })).error.code).toBe(
      "kernel_session_changed",
    );
  });

  it("preserves non-replaying receipts and unknown outcomes across provider generations", async () => {
    const receipt = await runtime.executeCode(codeArgs());
    await flush();
    runtime.dispose();
    expect(resets.size).toBe(0);
    runtime = new Runtime(context, ledger);
    const again = await runtime.executeCode(codeArgs());
    expect(again.executionId).toBe(receipt.executionId);
    expect(again.error.outcomeUnknown).toBe(true);
    expect(sends.length).toBe(1);
    sends[0].observe({ output_type: "stream", text: "late" });
    expect((await runtime.getExecution({ executionId: receipt.executionId })).outputs.length).toBe(
      0,
    );
  });

  it("releases reset subscriptions and kernel references when the store removes a kernel", async () => {
    runtime.dispose();
    let removed;
    const store = {
      runningKernels: [kernel],
      onDidRemoveKernel(callback) {
        removed = callback;
        return { dispose() {} };
      },
    };
    context.getStore = () => store;
    runtime = new Runtime(context, ledger);
    await runtime.executeCode(codeArgs());
    await flush();
    expect(runtime.kernelSessions.size).toBe(1);
    store.runningKernels = [];
    removed(kernel);
    expect(runtime.kernelSessions.size).toBe(0);
    expect(resets.size).toBe(0);
  });

  it("retains operation protection when a completed result leaves the bounded cache", async () => {
    context.runCode = async () => ({ status: "ok", success: true });
    const first = await runtime.executeCode(codeArgs("first"));
    await flush();
    for (let index = 0; index < 200; index++) {
      await runtime.executeCode(codeArgs(`other-${index}`));
      await flush();
    }
    const again = await runtime.executeCode(codeArgs("first"));
    expect(again.executionId).toBe(first.executionId);
    expect(again.error.code).toBe("execution_expired");
    expect(ledger.operations.size).toBe(201);
  });

  it("enforces argument limits itself even when a bridge bypasses JSON Schema", async () => {
    await rejected(runtime.executeCode({ ...codeArgs(), unexpected: true }), "invalid_arguments");
    await rejected(
      runtime.executeCode({ ...codeArgs(), code: "x".repeat(262145) }),
      "invalid_arguments",
    );
    await rejected(
      runtime.getExecution({ executionId: "unknown", waitMs: Infinity }),
      "invalid_arguments",
    );
    expect(sends.length).toBe(0);
  });
});

describe("Jupyter MCP provider lifecycle", () => {
  afterEach(async () => {
    await lumine.packages.activatePackage("jupyter-repl");
  });
  it("registers descriptors synchronously and revokes stale tools after unload/reload", async () => {
    await lumine.packages.activatePackage("jupyter-repl");
    let current = lumine.packages.getActivePackage("jupyter-repl").mainModule;
    const tools = current.provideMcpTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(8);
    const operationId = randomUUID();
    const args = { kernelId: "missing-kernel-for-lifecycle", code: "never_run()", operationId };
    const first = await tools.find((tool) => tool.name === "ExecuteJupyterCode").execute(args);
    const retired = tools.find((tool) => tool.name === "ListJupyterKernels");
    await lumine.packages.deactivatePackage("jupyter-repl");
    await lumine.packages.unloadPackage("jupyter-repl");
    expect(() => retired.execute({})).toThrow();
    await lumine.packages.activatePackage("jupyter-repl");
    current = lumine.packages.getActivePackage("jupyter-repl").mainModule;
    const fresh = current.provideMcpTools();
    const again = await fresh.find((tool) => tool.name === "ExecuteJupyterCode").execute(args);
    expect(again.executionId).toBe(first.executionId);
    expect(again.alreadyAccepted).toBe(true);
    expect(fresh.find((tool) => tool.name === "GetJupyterExecution").annotations.readOnlyHint).toBe(
      true,
    );
    expect(fresh.find((tool) => tool.name === "ExecuteJupyterCode").annotations.readOnlyHint).toBe(
      false,
    );
  });

  it("never routes a retired kernel ID to a new facade after package cache teardown", async () => {
    function makeKernel() {
      const Kernel = require("../lib/kernel");
      const KernelTransport = require("../lib/kernel-transport");
      const transport = new KernelTransport({ language: "python", display_name: "Python" }, null);
      transport.execute = jasmine.createSpy("execute");
      return new Kernel(transport);
    }
    await lumine.packages.activatePackage("jupyter-repl");
    const retired = makeKernel();
    const retiredId = retired.id;
    expect(retired.getPluginWrapper().id).toBe(retiredId);
    retired.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
    await lumine.packages.unloadPackage("jupyter-repl");
    await lumine.packages.activatePackage("jupyter-repl");
    const replacement = makeKernel();
    const { McpExecutionRuntime, createLedger } = require("../lib/mcp-execution");
    const runtime = new McpExecutionRuntime(
      { getStore: () => ({ runningKernels: [replacement] }) },
      createLedger(),
    );
    try {
      expect(replacement.id).not.toBe(retiredId);
      expect(replacement.id).toMatch(/^kernel-[0-9a-f-]{36}$/);
      const receipt = await runtime.executeCode({
        kernelId: retiredId,
        operationId: randomUUID(),
        code: "never_run()",
      });
      expect(receipt.accepted).toBe(false);
      expect(receipt.error.code).toBe("kernel_not_found");
      expect(replacement.transport.execute).not.toHaveBeenCalled();
    } finally {
      runtime.dispose();
      replacement.destroy();
    }
  });
});

describe("MCP uses the normal kernel output pipeline", () => {
  it("logs the same outputs and waits for both shell reply and idle", async () => {
    const { createKernelResultAsync } = require("../lib/result");
    const OutputStore = require("../lib/store/output");
    spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve(null));
    const kernel = {
      outputStore: new OutputStore(),
      setLastOutputStore() {},
      execute(_code, receive) {
        this.receive = receive;
      },
    };
    require("./helpers/session").wrapSession(kernel);
    let settled = false;
    const pending = createKernelResultAsync(kernel, "print(1)").then((result) => {
      settled = true;
      return result;
    });
    await Promise.resolve();
    kernel.receive({ stream: "status", data: "ok" });
    kernel.receive({ output_type: "stream", name: "stdout", text: "1\n" });
    await flush();
    expect(settled).toBe(false);
    expect(kernel.outputStore.outputs[0].text).toBe("1\n");
    kernel.receive({ output_type: "status", execution_state: "idle" });
    expect((await pending).success).toBe(true);
  });
});
