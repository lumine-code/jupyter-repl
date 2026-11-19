const { Emitter } = require("lumine");
const { copyOutputContext, renderOptionsForOutput } = require("../traceback-context");
const { BOKEH_LOAD, PANEL_LOAD } = require("../output-media");
const {
  appendStreamText,
  streamMergeTarget,
  normalizeStreamOutput,
  copyStreamOutput,
  OUTPUT_TYPES,
} = require("../output-utils");

const DOCK_MAX_OUTPUTS = 200;
const DOCK_MAX_BYTES = 32 * 1024 * 1024;
const OMITTED_OUTPUT = "[Output exceeded the dock history size limit.]";

// An estimate of retained JS data, without serializing MIME bundles or
// walking any further once the output has already exceeded the budget.
function outputWeight(value, budget, depth = 0) {
  if (typeof value === "string") return 16 + value.length * 2;
  if (!value || typeof value !== "object") return 8;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return 24 + value.byteLength;
  if (depth >= 32) return Infinity;

  let weight = 32;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    weight += 8 + key.length * 2 + outputWeight(value[key], budget - weight, depth + 1);
    if (weight > budget) break;
  }
  return weight;
}

class OutputStore {
  outputs = [];
  // The execution lifecycle this store is displaying: queued -> running ->
  // ok | error. A store starts queued; the kernel's execute_input flips it to
  // running (the execution_count stream below), and the shell reply settles it.
  // The store owns this state outright — nothing consults the kernel.
  status = "queued";
  executionCount = null;
  index = -1;
  _outputIdCounter = 0;
  lastCode = null;
  _currentRun = { clearOnNextOutput: false };
  _outputRuns = null;
  // Upper bound on retained history entries; oldest are dropped past this.
  // Defaults to Infinity so cell results keep every output.
  maxOutputs = Infinity;

  constructor(maxOutputs = Infinity, maxBytes = Infinity) {
    this.maxOutputs = maxOutputs;
    this.maxBytes = maxBytes;
    this.retainedBytes = 0;
    this.outputWeights = maxBytes < Infinity ? new WeakMap() : null;
    this.omittedStreams = maxBytes < Infinity ? new WeakSet() : null;
    this.emitter = new Emitter();
  }

  static forDock() {
    return new OutputStore(DOCK_MAX_OUTPUTS, DOCK_MAX_BYTES);
  }

  /**
   * Invoke the callback after any observable change: outputs, status,
   * execution count, history index, or last code.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  _emitUpdate() {
    this.emitter.emit("did-update");
  }

  setLastCode(code) {
    this.lastCode = code;
    this._emitUpdate();
  }

  appendOutput(message, run = this._currentRun) {
    if (message.output_type === "clear_output") {
      // IPython.display.clear_output: with wait=true the clear is deferred
      // until the next output arrives, so live-updating loops don't flicker.
      if (message.wait) {
        run.clearOnNextOutput = true;
      } else {
        this._clearRun(run);
      }
    } else if (message.stream === "execution_count") {
      this.executionCount = message.data;
      // execute_input is the kernel saying it has started this very cell —
      // the queued -> running transition. Strictly forward: the reply travels
      // on a different socket than this notification, and for a fast cell it
      // can win the race, so a late execute_input must never drag a settled
      // status back to a spinner nothing would ever clear.
      if (this.status === "queued") {
        this.status = "running";
      }
    } else if (message.stream === "status") {
      this.status = message.data;
    } else if (OUTPUT_TYPES.includes(message.output_type)) {
      if (run.clearOnNextOutput) this._clearRun(run);
      // The same message can reach an inline result, the dock and an adapter.
      // Own the mutable record (and stream cursor), so reducing one store's
      // next chunk cannot change another store or the caller's message.
      const changed = this._appendData(message, run);
      if (!changed && this.index === this.outputs.length - 1) return;
      this._trimHistory();
      this.index = this.outputs.length - 1;
    } else {
      return;
    }
    this._emitUpdate();
  }

  _appendData(message, run) {
    const last = this.outputs[this.outputs.length - 1];
    let previous = null;
    if (!this._outputRuns || this._outputRuns.get(last) === run) {
      previous = streamMergeTarget(this.outputs, message);
      if (this._outputRuns && this._outputRuns.get(previous) !== run) previous = null;
    }
    if (previous && this.omittedStreams?.has(previous)) return false;

    let output = previous;
    if (previous) {
      appendStreamText(previous, message);
    } else {
      output = copyStreamOutput(message);
      copyOutputContext(message, output);
      output._id = ++this._outputIdCounter;
      this.outputs.push(normalizeStreamOutput(output));
      this._outputRuns?.set(output, run);
    }
    if (!this.outputWeights) return true;

    // Plot runtimes are resources, even when the loader row lives outside the
    // current dock page. Keep their existing kernel scope and size checks.
    const bundle = output.data;
    const loadMime = bundle?.[BOKEH_LOAD] !== undefined ? BOKEH_LOAD : PANEL_LOAD;
    if (bundle?.[loadMime] !== undefined) {
      const { kernel } = renderOptionsForOutput(output);
      require("../components/result-view/bokeh").rememberBokehLoad(
        kernel,
        loadMime,
        bundle[loadMime],
        bundle,
      );
    }

    this.retainedBytes -= this.outputWeights.get(output) ?? 0;
    let weight = outputWeight(output, this.maxBytes);
    if (weight > this.maxBytes) {
      const index = this.outputs.lastIndexOf(output);
      const { _id, name, output_type } = output;
      output =
        output_type === "stream"
          ? { _id, output_type, name, text: OMITTED_OUTPUT }
          : { _id, output_type: "display_data", data: { "text/plain": OMITTED_OUTPUT } };
      if (output_type === "stream") this.omittedStreams.add(output);
      this.outputs[index] = output;
      this._outputRuns?.set(output, run);
      weight = outputWeight(output, this.maxBytes);
    }
    this.outputWeights.set(output, weight);
    this.retainedBytes += weight;
    return true;
  }

  _trimHistory() {
    let excess = Math.max(0, this.outputs.length - this.maxOutputs);
    if (this.outputWeights) {
      for (let index = 0; index < excess; index++) {
        this.retainedBytes -= this.outputWeights.get(this.outputs[index]);
      }
      while (this.retainedBytes > this.maxBytes && excess < this.outputs.length) {
        this.retainedBytes -= this.outputWeights.get(this.outputs[excess++]);
      }
    }
    if (excess > 0) {
      this.outputs.splice(0, excess);
    }
  }

  _clearRun(run) {
    run.clearOnNextOutput = false;
    if (!this._outputRuns) {
      this._resetOutputs();
      return;
    }
    this.outputs = this.outputs.filter((output) => {
      if (this._outputRuns.get(output) !== run) return true;
      if (this.outputWeights) this.retainedBytes -= this.outputWeights.get(output);
      return false;
    });
    this.index = this.outputs.length - 1;
  }

  setIndex = (index) => {
    let nextIndex;
    if (index < 0) {
      nextIndex = this.outputs.length > 0 ? 0 : -1;
    } else if (index < this.outputs.length) {
      nextIndex = index;
    } else {
      nextIndex = this.outputs.length - 1;
    }
    if (this.index === nextIndex) return;
    this.index = nextIndex;
    this._emitUpdate();
  };

  incrementIndex = () => {
    this.setIndex(this.index + 1);
  };

  decrementIndex = () => {
    this.setIndex(this.index - 1);
  };

  _resetOutputs() {
    this.outputs = [];
    this.retainedBytes = 0;
    this.index = -1;
    this._currentRun.clearOnNextOutput = false;
  }

  clear = () => {
    this._resetOutputs();
    this._emitUpdate();
  };

  // Retain output ownership even when two executions submit requests before
  // either reply arrives. clear_output and stream reduction stay within a run.
  startNewRun() {
    this._outputRuns ||= new WeakMap();
    this._currentRun = { clearOnNextOutput: false };
    return this._currentRun;
  }

  getRunOutputs(run) {
    return this.outputs.filter((output) => this._outputRuns?.get(output) === run);
  }
}

module.exports = OutputStore;
