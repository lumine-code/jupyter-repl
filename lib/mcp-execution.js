const { randomUUID, createHash } = require("node:crypto");

const LEDGER = Symbol.for("lumine.jupyter-repl.mcp-execution-ledger.v1");
const MAX_RECORDS = 200;
const MAX_OPERATIONS = 5000;
const MAX_OUTPUTS = 64;
const MAX_TEXT = 16384;
const MAX_PENDING_WAITS = 8;
const TERMINAL = new Set(["done", "error"]);
const FIELDS = {
  executeCode: ["kernelId", "operationId", "code"],
  runCell: ["kernelId", "operationId", "notebookId", "expectedRevision", "cellId"],
  runNotebook: ["kernelId", "operationId", "notebookId", "expectedRevision"],
  bindNotebookKernel: ["kernelId", "operationId", "notebookId", "expectedRevision"],
  interruptKernel: ["kernelId", "operationId"],
  restartKernel: ["kernelId", "operationId"],
};

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function abortError() {
  const error = failure(
    "observation_cancelled",
    "The MCP request was cancelled. Accepted kernel work is not interrupted.",
  );
  error.name = "AbortError";
  return error;
}
function requireString(value, name, limit = 256, empty = false) {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > limit) {
    throw failure(
      "invalid_arguments",
      `${name} must be ${empty ? "a" : "a non-empty"} string of at most ${limit} characters.`,
    );
  }
}
function validate(args, keys) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    Object.keys(args).some((key) => !keys.includes(key))
  ) {
    throw failure("invalid_arguments", "Unexpected tool arguments.");
  }
}
function createLedger() {
  return { epoch: randomUUID(), operations: new Map(), records: new Map() };
}
function windowLedger() {
  // Only plain receipt/result data survive module-cache teardown. Kernel,
  // adapter, module and waiter references belong to the disposable runtime.
  return (window[LEDGER] ||= createLedger());
}
function boundedText(value, limit = 2048) {
  const parts = Array.isArray(value) ? value : [value];
  let text = "";
  let length = 0;
  for (const part of parts) {
    if (typeof part !== "string") continue;
    length += part.length;
    if (text.length < limit) text += part.slice(0, limit - text.length);
  }
  return { text, truncated: length > limit };
}
function boundedMetadata(value, depth = 0) {
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 256);
  if (depth > 2 || typeof value !== "object") return null;
  if (Array.isArray(value))
    return value.slice(0, 8).map((entry) => boundedMetadata(entry, depth + 1));
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .map(([key, entry]) => [key.slice(0, 128), boundedMetadata(entry, depth + 1)]),
  );
}
function publicRecord(record) {
  const { textBytes: _textBytes, clearPending: _clearPending, ...result } = record;
  return JSON.parse(JSON.stringify(result));
}

class McpExecutionRuntime {
  constructor(context, ledger = windowLedger()) {
    this.context = context;
    this.ledger = ledger;
    this.generation = randomUUID();
    this.active = true;
    this.queues = new Map();
    this.pending = new Map();
    this.waiters = new Map();
    this.pendingWaits = 0;
    this.kernelSessions = new Map();
    this.ownedRecords = new Set();
    this.removedSubscription = context.getStore().onDidRemoveKernel?.((kernel) => {
      const session = this.kernelSessions.get(kernel);
      if (session) session.version++;
      session?.subscription?.dispose?.();
      this.kernelSessions.delete(kernel);
    });
  }

  assertActive() {
    if (!this.active)
      throw failure(
        "provider_unavailable",
        "The Jupyter MCP provider was deactivated. Reconnect before invoking tools.",
      );
  }
  kernel(id) {
    this.assertActive();
    requireString(id, "kernelId");
    const kernel = this.context.getStore().runningKernels.find((candidate) => candidate.id === id);
    if (!kernel)
      throw failure(
        "kernel_not_found",
        "The requested kernel is no longer running. List kernels again.",
      );
    return kernel;
  }
  kernelSession(kernel) {
    let session = this.kernelSessions.get(kernel);
    if (!session) {
      session = { version: 0, subscription: null };
      session.subscription = kernel.transport?.onDidResetComms?.(() => {
        session.version++;
      });
      this.kernelSessions.set(kernel, session);
    }
    return session;
  }
  ensureKernel(kernel, session, version) {
    if (this.kernel(kernel.id) !== kernel || session.version !== version) {
      throw failure(
        "kernel_session_changed",
        "The kernel session changed after this operation was accepted. Code was not replayed.",
      );
    }
  }

  listKernels(args = {}) {
    validate(args, []);
    this.assertActive();
    const store = this.context.getStore();
    return {
      generation: this.generation,
      kernels: store.runningKernels.map((kernel) => ({
        kernelId: kernel.id,
        name: kernel.displayName || kernel.kernelSpec?.display_name || kernel.id,
        language: kernel.language || kernel.kernelSpec?.language || "",
        state: kernel.executionState || "unknown",
        executionCount: kernel.executionCount ?? null,
        files: (store.getFilesForKernel?.(kernel) || []).slice(0, 100),
        remote: Boolean(kernel.transport?.session),
      })),
    };
  }

  receipt(operation) {
    const record = this.ledger.records.get(operation.executionId);
    return record
      ? { ...publicRecord(record), alreadyAccepted: true }
      : {
          executionId: operation.executionId,
          accepted: operation.accepted,
          alreadyAccepted: true,
          state: "error",
          error: {
            code: "execution_expired",
            message: "The result was evicted; this operation will not execute again.",
          },
        };
  }
  trimRecords() {
    while (this.ledger.records.size >= MAX_RECORDS) {
      const oldest = [...this.ledger.records.values()].find((record) => TERMINAL.has(record.state));
      if (!oldest)
        throw failure("execution_capacity", "Too many Jupyter operations are still pending.");
      this.ledger.records.delete(oldest.executionId);
    }
  }
  changed(record) {
    record.version++;
    record.updatedAt = Date.now();
    for (const wake of [...(this.waiters.get(record.executionId) || [])]) wake();
  }
  fail(record, error, outcomeUnknown = record.dispatched) {
    if (TERMINAL.has(record.state)) return;
    record.state = "error";
    record.error = {
      code: error.code || "execution_failed",
      message: String(error.message || error).slice(0, 4000),
      outcomeUnknown: Boolean(outcomeUnknown),
    };
    record.finishedAt = Date.now();
    for (const cell of record.cells) {
      if (cell.state === "queued") cell.state = "skipped";
      else if (cell.state === "running") cell.state = "error";
    }
    this.changed(record);
  }

  async accept(method, args, request, prepare, control = false) {
    this.assertActive();
    validate(args, FIELDS[method]);
    for (const name of FIELDS[method])
      requireString(
        args[name],
        name,
        name === "code" ? 262144 : name === "operationId" ? 128 : 256,
        name === "code",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([method, FIELDS[method].map((key) => args[key])]))
      .digest("hex");
    const previous = this.ledger.operations.get(args.operationId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw failure(
          "operation_conflict",
          "operationId was already used with different arguments. No code was submitted.",
        );
      if (this.pending.has(args.operationId)) await this.pending.get(args.operationId);
      return this.receipt(previous);
    }
    if (request.signal?.aborted) throw abortError();
    if (this.ledger.operations.size >= MAX_OPERATIONS)
      throw failure(
        "operation_capacity",
        "This window's operation receipt ledger is full. Existing operations remain protected against replay.",
      );
    this.trimRecords();
    const executionId = `${this.ledger.epoch}:${this.generation}:${randomUUID()}`;
    const record = {
      executionId,
      operationId: args.operationId,
      kind: method,
      kernelId: args.kernelId,
      ...(args.notebookId ? { notebookId: args.notebookId } : {}),
      accepted: false,
      state: "queued",
      phase: "validating",
      version: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dispatched: false,
      outputs: [],
      textBytes: 0,
      outputEvents: 0,
      outputsTruncated: false,
      cells: [],
    };
    const operation = { executionId, fingerprint, accepted: false };
    // Reserve synchronously, before notebook synchronization can yield. A
    // concurrent retry observes this same receipt rather than a second send.
    this.ledger.operations.set(args.operationId, operation);
    this.ledger.records.set(executionId, record);
    this.ownedRecords.add(executionId);
    const preparing = (async () => {
      try {
        const plan = await prepare(record);
        this.assertActive();
        if (request.signal?.aborted) throw abortError();
        record.accepted = operation.accepted = true;
        record.phase = "accepted";
        this.changed(record);
        const session = this.kernelSession(plan.kernel);
        const version = session.version;
        const run = async () => {
          if (!this.active || TERMINAL.has(record.state)) return;
          try {
            this.ensureKernel(plan.kernel, session, version);
            const result = await plan.run(
              (output, cellId) => this.observe(record, output, cellId),
              () => this.ensureKernel(plan.kernel, session, version),
            );
            if (!this.active || TERMINAL.has(record.state)) return;
            if (result?.cancelled || result?.success === false) {
              this.fail(
                record,
                failure(
                  result.cancelled ? "execution_cancelled" : "kernel_error",
                  result.reason ||
                    record.kernelError?.message ||
                    "The kernel reported an execution error.",
                ),
                result.cancelled || record.kernelError?.outcomeUnknown || false,
              );
            } else {
              record.state = "done";
              record.phase = "finished";
              record.finishedAt = Date.now();
              this.changed(record);
            }
          } catch (error) {
            if (this.active) this.fail(record, error);
          }
        };
        if (control) void Promise.resolve().then(run);
        else {
          const tail = this.queues.get(plan.kernel) || Promise.resolve();
          const next = tail.then(run, run);
          this.queues.set(plan.kernel, next);
          void next.finally(() => {
            if (this.queues.get(plan.kernel) === next) this.queues.delete(plan.kernel);
          });
        }
      } catch (error) {
        this.fail(record, error, false);
      }
    })();
    this.pending.set(args.operationId, preparing);
    await preparing;
    this.pending.delete(args.operationId);
    return { ...publicRecord(record), alreadyAccepted: false };
  }

  executeCode(args, request = {}) {
    return this.accept("executeCode", args, request, async (record) => {
      const kernel = this.kernel(args.kernelId);
      return {
        kernel,
        run: (observe) => {
          record.dispatched = true;
          const execute =
            this.context.runCode ||
            ((...params) => require("./result").createKernelResultAsync(...params));
          return execute(kernel, args.code, observe);
        },
      };
    });
  }

  async notebookPlan(args, record, cellOnly) {
    const service = this.context.getNotebookService?.();
    if (
      !service?.getExecutionSnapshot ||
      !service?.getExecutionAdapter ||
      !service?.getNotebookRevision
    ) {
      throw failure(
        "notebook_provider_unavailable",
        "Enable jupyter-view to execute a live notebook through MCP.",
      );
    }
    const snapshot = await service.getExecutionSnapshot({
      notebookId: args.notebookId,
      maxCells: 1000,
      maxSourceChars: 1048576,
      ...(cellOnly ? { cellIds: [args.cellId] } : { codeOnly: true }),
    });
    this.assertActive();
    if (
      snapshot.revision !== args.expectedRevision ||
      service.getNotebookRevision(args.notebookId) !== args.expectedRevision
    ) {
      throw failure(
        "source_revision_conflict",
        "The notebook source changed. Read it again before requesting execution.",
      );
    }
    const captured = snapshot.cells.filter(
      (cell) => cell.type === "code" && (!cellOnly || cell.cellId === args.cellId),
    );
    if (cellOnly && captured.length !== 1)
      throw failure("cell_not_found", "The requested code cell is missing or is not executable.");
    if (
      captured.length > 1000 ||
      captured.reduce((size, cell) => size + cell.source.length, 0) > 1048576
    )
      throw failure("notebook_limit", "This run exceeds 1000 code cells or 1 MiB of source.");
    const kernel = this.kernel(args.kernelId);
    const integration = this.context.getIntegration();
    const adapter = service.getExecutionAdapter(args.notebookId);
    if (integration.getKernelForAdapter(adapter) !== kernel)
      throw failure(
        "kernel_not_bound",
        "The requested kernel is not bound to this notebook. Connect it in the notebook first.",
      );
    record.cells = captured.map((cell) => ({
      cellId: cell.cellId,
      state: "queued",
      executionCount: null,
    }));
    return {
      kernel,
      run: async (observe, ensureKernel) => {
        for (let index = 0; index < captured.length; index++) {
          this.assertActive();
          ensureKernel();
          const cell = captured[index];
          const currentAdapter = service.getExecutionAdapter(args.notebookId);
          if (integration.getKernelForAdapter(currentAdapter) !== kernel)
            throw failure(
              "kernel_not_bound",
              "The notebook's bound kernel changed before execution.",
            );
          const target = currentAdapter.getRunTarget?.(cell.cellId);
          const currentCell = currentAdapter.getTarget?.(cell.cellId);
          if (
            !target ||
            target.type !== "code" ||
            target.source !== cell.source ||
            (currentCell && currentCell.sourceRevision !== cell.sourceRevision)
          ) {
            throw failure(
              "cell_source_changed",
              "A queued notebook cell was changed or deleted. Remaining cells were not executed.",
            );
          }
          record.cells[index].state = "running";
          record.dispatched = true;
          this.changed(record);
          const run =
            this.context.runTarget ||
            ((...params) => integration.runExplicitAdapterTarget(...params));
          const result = await run(
            this.context.getAdapterServices(),
            currentAdapter,
            kernel,
            target,
            (output) => observe(output, cell.cellId),
          );
          if (!this.active) return { success: false };
          record.cells[index].state = result.success ? "done" : "error";
          this.changed(record);
          if (!result.success) return result;
        }
        return { success: true };
      },
    };
  }
  runCell(args, request = {}) {
    return this.accept("runCell", args, request, (record) => this.notebookPlan(args, record, true));
  }
  runNotebook(args, request = {}) {
    return this.accept("runNotebook", args, request, (record) =>
      this.notebookPlan(args, record, false),
    );
  }

  bindNotebookKernel(args, request = {}) {
    return this.accept(
      "bindNotebookKernel",
      args,
      request,
      async (record) => {
        const service = this.context.getNotebookService?.();
        if (!service?.getExecutionAdapter || !service?.getNotebookRevision) {
          throw failure(
            "notebook_provider_unavailable",
            "Enable jupyter-view to bind a live notebook through MCP.",
          );
        }
        const checkRevision = () => {
          if (service.getNotebookRevision(args.notebookId) !== args.expectedRevision) {
            throw failure(
              "source_revision_conflict",
              "The notebook source changed. Read it again before changing its kernel binding.",
            );
          }
        };
        checkRevision();
        const kernel = this.kernel(args.kernelId);
        const integration = this.context.getIntegration();
        return {
          kernel,
          run: async () => {
            this.assertActive();
            checkRevision();
            const adapter = service.getExecutionAdapter(args.notebookId);
            record.state = "running";
            this.changed(record);
            const bound = await integration.bindExistingAdapterKernel(
              this.context.getAdapterServices(),
              adapter,
              kernel,
              () => {
                record.dispatched = true;
              },
            );
            this.assertActive();
            if (!bound)
              throw failure(
                "kernel_binding_failed",
                "The notebook refused the kernel binding. Read the notebook again before another attempt.",
              );
            record.notebookRevision = service.getNotebookRevision(args.notebookId);
            record.binding = {
              notebookId: args.notebookId,
              kernelId: kernel.id,
              revision: record.notebookRevision,
            };
            return { success: true };
          },
        };
      },
      true,
    );
  }

  interruptKernel(args, request = {}) {
    return this.accept(
      "interruptKernel",
      args,
      request,
      async (record) => {
        const kernel = this.kernel(args.kernelId);
        return {
          kernel,
          run: () => {
            record.dispatched = true;
            record.state = "running";
            this.changed(record);
            kernel.interrupt();
            return { success: true };
          },
        };
      },
      true,
    );
  }
  restartKernel(args, request = {}) {
    return this.accept(
      "restartKernel",
      args,
      request,
      async (record) => {
        const kernel = this.kernel(args.kernelId);
        return {
          kernel,
          run: async () => {
            record.dispatched = true;
            record.state = "running";
            this.changed(record);
            const restarted = await kernel.restart();
            return { success: restarted !== false };
          },
        };
      },
      true,
    );
  }

  observe(record, output, cellId) {
    if (!this.active || TERMINAL.has(record.state) || !output) return;
    if (output.stream === "execution_count") {
      record.executionCount = output.data;
      record.state = "running";
      const cell = record.cells.find((entry) => entry.cellId === cellId);
      if (cell) cell.executionCount = output.data;
    } else if (output.output_type === "status" && output.execution_state === "busy") {
      record.state = "running";
    } else if (output.output_type === "clear_output") {
      const scope = cellId || "";
      record.clearPending ||= [];
      if (output.wait) {
        if (!record.clearPending.includes(scope)) record.clearPending.push(scope);
      } else this.clearOutputs(record, scope);
    } else if (["stream", "error", "execute_result", "display_data"].includes(output.output_type)) {
      const scope = cellId || "";
      if (record.clearPending?.includes(scope)) this.clearOutputs(record, scope);
      record.outputEvents++;
      const limit = Math.max(0, Math.min(2048, MAX_TEXT - record.textBytes));
      const summary = { outputType: output.output_type, ...(cellId ? { cellId } : {}) };
      if (output.output_type === "stream") {
        summary.name = output.name || "stdout";
        Object.assign(summary, boundedText(output.text, limit));
      } else if (output.output_type === "error") {
        summary.ename = boundedText(output.ename, 128).text;
        Object.assign(summary, boundedText(output.evalue, limit));
        summary.traceback = (Array.isArray(output.traceback) ? output.traceback : [])
          .slice(-12)
          .map((line) => boundedText(line, 256).text);
        record.kernelError = {
          ename: summary.ename,
          message: summary.text,
          outcomeUnknown: /OutcomeUnknown|Aborted|KernelGone|Unresponsive/.test(summary.ename),
        };
      } else {
        summary.mimeTypes = Object.keys(output.data || {})
          .slice(0, 32)
          .map((mime) => mime.slice(0, 256));
        const metadata = boundedMetadata(output.metadata || {});
        summary.metadata =
          JSON.stringify(metadata).length > 2048
            ? {
                truncated: true,
                keys: Object.keys(output.metadata || {})
                  .slice(0, 12)
                  .map((key) => key.slice(0, 128)),
              }
            : metadata;
        Object.assign(summary, boundedText(output.data?.["text/plain"], limit));
        if (output.execution_count != null) summary.executionCount = output.execution_count;
      }
      record.textBytes += summary.text?.length || 0;
      if (record.outputs.length < MAX_OUTPUTS && record.textBytes <= MAX_TEXT)
        record.outputs.push(summary);
      else record.outputsTruncated = true;
      if (summary.truncated) record.outputsTruncated = true;
    }
    this.changed(record);
  }

  clearOutputs(record, scope) {
    record.outputs = scope ? record.outputs.filter((output) => output.cellId !== scope) : [];
    record.textBytes = record.outputs.reduce(
      (size, output) => size + (output.text?.length || 0),
      0,
    );
    record.clearPending = (record.clearPending || []).filter((pending) => pending !== scope);
  }

  async getExecution(args, request = {}) {
    validate(args, ["executionId", "waitMs", "afterVersion"]);
    requireString(args.executionId, "executionId");
    const waitMs = args.waitMs ?? 0;
    if (
      !Number.isInteger(waitMs) ||
      waitMs < 0 ||
      waitMs > 10000 ||
      (args.afterVersion != null && (!Number.isInteger(args.afterVersion) || args.afterVersion < 0))
    )
      throw failure(
        "invalid_arguments",
        "waitMs must be 0..10000; afterVersion must be a nonnegative integer.",
      );
    this.assertActive();
    if (request.signal?.aborted) throw abortError();
    const record = this.ledger.records.get(args.executionId);
    if (!record)
      throw failure(
        "execution_not_found",
        "The execution is unknown or its retained result expired. Accepted operations are never replayed automatically.",
      );
    if (
      !waitMs ||
      TERMINAL.has(record.state) ||
      (args.afterVersion != null && record.version > args.afterVersion)
    )
      return publicRecord(record);
    if (this.pendingWaits >= MAX_PENDING_WAITS) {
      throw failure(
        "too_many_waits",
        "At most eight Jupyter execution observations may wait at once in this window. Cancel an observation or wait for it to finish.",
      );
    }
    this.pendingWaits++;
    await new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      const listeners = this.waiters.get(record.executionId) || new Set();
      this.waiters.set(record.executionId, listeners);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this.pendingWaits--;
        clearTimeout(timer);
        listeners.delete(wake);
        if (!listeners.size) this.waiters.delete(record.executionId);
        request.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const wake = () => finish();
      const abort = () => finish(abortError());
      listeners.add(wake);
      request.signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(wake, waitMs);
      if (request.signal?.aborted) abort();
    });
    return publicRecord(record);
  }

  dispose() {
    if (!this.active) return;
    this.active = false;
    this.removedSubscription?.dispose?.();
    this.removedSubscription = null;
    for (const id of this.ownedRecords) {
      const record = this.ledger.records.get(id);
      if (record && !TERMINAL.has(record.state))
        this.fail(
          record,
          failure(
            "provider_unavailable",
            "The provider was deactivated; the execution outcome may be unknown. Reusing operationId will not run it again.",
          ),
          record.dispatched,
        );
    }
    for (const listeners of [...this.waiters.values()]) for (const wake of [...listeners]) wake();
    for (const session of this.kernelSessions.values()) session.subscription?.dispose?.();
    this.waiters.clear();
    this.kernelSessions.clear();
    this.queues.clear();
    this.pending.clear();
    this.ownedRecords.clear();
    this.context = null;
  }
}

module.exports = {
  McpExecutionRuntime,
  createLedger,
  MAX_RECORDS,
  MAX_OPERATIONS,
  MAX_OUTPUTS,
  MAX_TEXT,
  MAX_PENDING_WAITS,
};
