const { Emitter } = require("lumine");
const { isTextOutputOnly } = require("../components/result-view/display");
const {
  reduceOutputs,
  normalizeStreamOutput,
  isSingleLine,
  OUTPUT_TYPES,
} = require("../output-utils");

class OutputStore {
  outputs = [];
  // The execution lifecycle this store is displaying: queued -> running ->
  // ok | error. A store starts queued; the kernel's execute_input flips it to
  // running (the execution_count stream below), and the shell reply settles it.
  // The store owns this state outright — nothing consults the kernel.
  status = "queued";
  executionCount = null;
  index = -1;
  position = {
    lineHeight: 0,
    lineLength: 0,
    editorWidth: 0,
    charWidth: 0,
  };
  _outputIdCounter = 0;
  lastCode = null;
  _clearOnNextOutput = false;
  // When set, the next output begins a fresh history entry instead of merging
  // into the previous one (used so watch re-runs accumulate a scrubbable history).
  _startNewGroup = false;
  // Index in `outputs` where the current run's outputs begin. clear_output
  // clears from here, so accumulated histories (watches) keep earlier runs.
  // Stays 0 for inline/cell results that never start a new run.
  _currentRunStart = 0;
  // Upper bound on retained history entries; oldest are dropped past this.
  // Defaults to Infinity so cell results keep every output.
  maxOutputs = Infinity;

  constructor(maxOutputs = Infinity) {
    this.maxOutputs = maxOutputs;
    this.emitter = new Emitter();
  }

  /**
   * Invoke the callback after any observable change: outputs, status,
   * execution count, history index, position, or last code.
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

  get isPlain() {
    if (this.outputs.length !== 1) {
      return false;
    }
    const availableSpace = Math.floor(
      (this.position.editorWidth - this.position.lineLength) / this.position.charWidth,
    );
    if (availableSpace <= 0) {
      return false;
    }
    const output = this.outputs[0];

    switch (output.output_type) {
      case "execute_result":
      case "display_data": {
        const bundle = output.data;
        return isTextOutputOnly(bundle)
          ? isSingleLine(bundle["text/plain"], availableSpace)
          : false;
      }

      case "stream": {
        return isSingleLine(output.text, availableSpace);
      }

      default: {
        return false;
      }
    }
  }

  appendOutput(message) {
    if (message.output_type === "clear_output") {
      // IPython.display.clear_output: with wait=true the clear is deferred
      // until the next output arrives, so live-updating loops don't flicker.
      if (message.wait) {
        this._clearOnNextOutput = true;
      } else {
        this._clearCurrentRun();
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
      if (this._clearOnNextOutput) {
        this._clearOnNextOutput = false;
        this._clearCurrentRun();
      }
      // Assign unique ID for React key stability
      message._id = ++this._outputIdCounter;

      if (this._startNewGroup) {
        // First output of a new run: push as its own entry so it never merges
        // with the previous run's output, and mark where this run begins. It
        // still needs resolving, which the merge path would otherwise have done.
        this._startNewGroup = false;
        this._currentRunStart = this.outputs.length;
        this.outputs.push(normalizeStreamOutput(message));
      } else {
        reduceOutputs(this.outputs, message);
      }

      this._trimHistory();
      this.setIndex(this.outputs.length - 1);
    }
    this._emitUpdate();
  }

  _trimHistory() {
    const excess = this.outputs.length - this.maxOutputs;
    if (excess > 0) {
      this.outputs.splice(0, excess);
      this._currentRunStart = Math.max(0, this._currentRunStart - excess);
    }
  }

  // clear_output targets the current output area. For an accumulated history
  // (watch runs) that means only the current run's outputs; earlier runs are
  // kept. Without a run boundary (inline/cell results) this clears everything.
  _clearCurrentRun() {
    if (this._currentRunStart <= 0) {
      this.clear();
    } else {
      this.outputs.splice(this._currentRunStart);
      this.setIndex(this.outputs.length - 1);
    }
    // The next output begins the current run again, so force it into a fresh
    // entry instead of merging into the previous run's last output.
    this._startNewGroup = true;
  }

  updatePosition(position) {
    // Emit only when a value really moved: every listener re-renders a view,
    // and position refreshes arrive wholesale (marker moves, resize reads)
    // with all values usually unchanged.
    let changed = false;
    for (const key of Object.keys(position)) {
      if (this.position[key] !== position[key]) {
        this.position[key] = position[key];
        changed = true;
      }
    }
    if (changed) this._emitUpdate();
  }

  setIndex = (index) => {
    if (index < 0) {
      this.index = 0;
    } else if (index < this.outputs.length) {
      this.index = index;
    } else {
      this.index = this.outputs.length - 1;
    }
    this._emitUpdate();
  };

  incrementIndex = () => {
    this.index = this.index < this.outputs.length - 1 ? this.index + 1 : this.outputs.length - 1;
    this._emitUpdate();
  };

  decrementIndex = () => {
    this.index = this.index > 0 ? this.index - 1 : 0;
    this._emitUpdate();
  };

  clear = () => {
    this.outputs = [];
    this.index = -1;
    this._clearOnNextOutput = false;
    this._startNewGroup = false;
    this._currentRunStart = 0;
    this._emitUpdate();
  };

  // Begin a new history entry on the next output, so a re-run accumulates
  // alongside previous values instead of replacing or merging into them.
  // Mark the run boundary now so a clear_output arriving before the first
  // output still only clears this run, not earlier history.
  startNewRun() {
    this._startNewGroup = true;
    this._currentRunStart = this.outputs.length;
    // A deferred clear_output(wait=True) from a previous run must not carry
    // over and clobber this run's first output.
    this._clearOnNextOutput = false;
  }
}

module.exports = OutputStore;
