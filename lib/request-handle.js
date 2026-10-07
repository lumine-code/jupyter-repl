const { randomUUID } = require("node:crypto");
const { Disposable } = require("lumine");
const { OUTPUT_TYPES, normalizeOutput, createOutputAccumulator } = require("./output-utils");

const OUTPUT_EVENTS = new Set([...OUTPUT_TYPES, "clear_output", "update_display_data"]);
const retirements = new WeakMap();

function retireRequest(handle, reason, status) {
  retirements.get(handle)?.(reason, status);
}

function errorStatus(error) {
  if (error?.ename === "ExecutionOutcomeUnknown") return "unknown";
  if (["ExecutionCancelled", "ExecutionAborted", "RequestCancelled"].includes(error?.ename))
    return "cancelled";
  if (
    ["KernelUnresponsive", "KernelGone", "NoReplyError", "SessionUnavailable"].includes(
      error?.ename,
    )
  )
    return "unavailable";
  return "error";
}

function emptyData(type) {
  if (type === "complete") return { matches: [] };
  if (type === "inspect") return { data: {}, found: false };
  return undefined;
}

/** One caller's observation of a request. Disposing never interrupts the kernel. */
class RequestHandle {
  #listeners = new Set();
  #stateListeners = new Set();
  #accumulator = createOutputAccumulator();
  #error = null;
  #executionCount = null;
  #durationMs = null;
  #startedAt = null;
  #status = "queued";
  #replyStatus = null;
  #idleSeen = false;
  #settled = false;
  #dispatched = false;
  #resolve;
  #timer = null;
  #observation = null;
  #signal = null;
  #abort = null;
  #onFinish;
  #type;

  constructor({ generation, type, timeoutMs, signal, start, onFinish }) {
    this.#type = type;
    this.#onFinish = onFinish;
    retirements.set(this, (reason, status) => {
      const outcome =
        status || (this.#type === "execute" && this.#dispatched ? "unknown" : "unavailable");
      this.#finish({
        status: outcome,
        error: {
          ename: outcome === "unknown" ? "ExecutionOutcomeUnknown" : "SessionUnavailable",
          evalue: reason,
          traceback: [],
        },
      });
    });
    Object.defineProperties(this, {
      id: { value: `request-${randomUUID()}`, enumerable: true },
      generation: { value: generation, enumerable: true },
      done: {
        value: new Promise((resolve) => {
          this.#resolve = resolve;
        }),
        enumerable: true,
      },
    });
    this.#signal = signal || null;
    this.#abort = () => this.dispose();
    if (signal?.aborted) this.dispose();
    else signal?.addEventListener("abort", this.#abort, { once: true });
    if (!this.#settled && timeoutMs > 0)
      this.#timer = setTimeout(() => this.#finish({ status: "timeout" }), timeoutMs);
    // Consumers can subscribe before a synchronous implementation answers.
    queueMicrotask(() => {
      if (this.#settled) return;
      try {
        this.#dispatched = true;
        const observation = start(
          (output) => this.#receiveOutput(output),
          (data) => this.#receiveData(data),
        );
        if (this.#settled) this.#disposeObservation(observation);
        else this.#observation = observation;
      } catch (error) {
        this.#finish({
          status: "error",
          error: {
            ename: error.name || "SendError",
            evalue: error.message || String(error),
            traceback: [],
          },
        });
      }
    });
  }

  get status() {
    return this.#status;
  }
  get executionCount() {
    return this.#executionCount;
  }
  get durationMs() {
    return this.#durationMs;
  }

  onDidOutput(callback) {
    if (typeof callback !== "function") throw new TypeError("An output callback is required.");
    if (this.#settled) return new Disposable();
    this.#listeners.add(callback);
    return new Disposable(() => this.#listeners.delete(callback));
  }

  onDidChange(callback) {
    if (typeof callback !== "function")
      throw new TypeError("A request state callback is required.");
    if (this.#settled) return new Disposable();
    this.#stateListeners.add(callback);
    return new Disposable(() => this.#stateListeners.delete(callback));
  }

  dispose() {
    this.#finish({ status: "cancelled" });
  }

  #notifyState() {
    const state = {
      status: this.#status,
      executionCount: this.#executionCount,
      durationMs: this.#durationMs,
    };
    for (const callback of [...this.#stateListeners]) {
      try {
        callback(state);
      } catch (error) {
        console.error("jupyter-repl: request state callback failed:", error);
      }
    }
  }

  #receiveOutput(output) {
    if (this.#settled || !output) return;
    if (output.stream === "status") {
      this.#replyStatus ??= output.data;
      if (this.#startedAt !== null) this.#durationMs = Date.now() - this.#startedAt;
    } else if (output.stream === "execution_count") {
      this.#executionCount = output.data;
      this.#startedAt = Date.now();
      this.#status = "running";
      this.#notifyState();
    } else if (output.output_type === "status") {
      if (output.execution_state === "idle") this.#idleSeen = true;
    } else if (OUTPUT_EVENTS.has(output.output_type)) {
      const record = normalizeOutput(output);
      this.#accumulator.append(record);
      if (record.output_type === "error")
        this.#error = {
          ename: record.ename || "Error",
          evalue: record.evalue || "Unknown error",
          traceback: record.traceback || [],
        };
      for (const callback of [...this.#listeners]) {
        try {
          callback(normalizeOutput(output));
        } catch (error) {
          console.error("jupyter-repl: request output callback failed:", error);
        }
      }
    }
    if (this.#replyStatus !== null && this.#idleSeen) {
      const error = this.#error;
      this.#finish({
        status: this.#replyStatus === "ok" ? "ok" : errorStatus(error),
        ...(this.#replyStatus === "ok"
          ? {}
          : { error: error || { ename: "Error", evalue: "Unknown error", traceback: [] } }),
      });
    }
  }

  #receiveData(data) {
    if (this.#settled) return;
    const error =
      data?.status === "error"
        ? {
            ename: data.ename || "Error",
            evalue: data.evalue || "Unknown error",
            traceback: data.traceback || [],
          }
        : null;
    this.#finish({
      status: error ? errorStatus(error) : "ok",
      data: data || emptyData(this.#type),
      ...(error ? { error } : {}),
    });
  }

  #disposeObservation(observation) {
    if (observation?.disposeObservation) observation.disposeObservation();
    else observation?.dispose?.();
  }

  #finish(result) {
    if (this.#settled) return;
    this.#settled = true;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#signal?.removeEventListener("abort", this.#abort);
    this.#signal = null;
    this.#abort = null;
    const observation = this.#observation;
    this.#observation = null;
    this.#status = result.status;
    this.#notifyState();
    this.#listeners.clear();
    this.#stateListeners.clear();
    const data = emptyData(this.#type);
    const outcome = {
      status: result.status,
      outputs: this.#accumulator.outputs,
      executionCount: this.#executionCount,
      durationMs: this.#durationMs,
      ...(data ? { data } : {}),
      ...result,
    };
    this.#resolve(outcome);
    this.#resolve = null;
    const onFinish = this.#onFinish;
    this.#onFinish = null;
    onFinish?.(this);
    this.#disposeObservation(observation);
  }
}

module.exports = RequestHandle;
module.exports.retireRequest = retireRequest;
