/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
const { CompositeDisposable, Disposable } = require("lumine");
const { formatElapsedTime } = require("../../../utils");

// While a kernel is busy the elapsed time is redrawn from a timer rather than
// from a kernel message, because the kernel sends nothing between starting and
// finishing. Etch coalesces these into one text-node write per frame.
const TICK_MS = 50;

class StatusBar {
  constructor({ store, onClick, container }) {
    this.store = store;
    this.onClick = onClick;
    this.container = container;
    this.elapsedMs = 0;
    this.timerId = null;
    this.kernelSubscription = null;
    this.disabled = Boolean(lumine.config.get("jupyter-repl.statusBarDisable"));
    this.showKernelInfo = Boolean(lumine.config.get("jupyter-repl.statusBarKernelInfo"));

    etch.initialize(this);

    this.disposables = new CompositeDisposable(
      lumine.config.observe("jupyter-repl.statusBarDisable", (value) => {
        this.disabled = Boolean(value);
        etch.update(this);
      }),
      lumine.config.observe("jupyter-repl.statusBarKernelInfo", (value) => {
        this.showKernelInfo = Boolean(value);
        etch.update(this);
      }),
      this.store.onDidChangeCurrentKernel(() => this.watchCurrentKernel()),
      new Disposable(() => this.stopTimer()),
      new Disposable(() => this.kernelSubscription?.dispose()),
    );

    this.watchCurrentKernel();
  }

  // Follow whichever kernel the store currently reports, so the tile tracks the
  // active editor. Each kernel has its own status emitter, so the subscription
  // moves with it.
  watchCurrentKernel() {
    this.kernelSubscription?.dispose();
    const kernel = this.store.kernel;
    this.kernelSubscription = kernel ? kernel.onDidChangeStatus(() => this.syncTimer()) : null;
    this.syncTimer();
  }

  syncTimer() {
    const kernel = this.store.kernel;
    if (!kernel || kernel.executionState !== "busy") {
      this.stopTimer();
    } else if (!this.timerId) {
      this.startTimer();
    }
    etch.update(this);
  }

  startTimer() {
    this.stopTimer();
    this.elapsedMs = this.elapsedSinceStart();
    this.timerId = setInterval(() => {
      this.elapsedMs = this.elapsedSinceStart();
      etch.update(this);
    }, TICK_MS);
  }

  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  // The kernel owns the start time, so the count survives the tile re-rendering
  // for an unrelated reason (a config change, another kernel finishing).
  elapsedSinceStart() {
    const startTime = this.store.kernel?.executionStartTime;
    return startTime ? Date.now() - startTime : 0;
  }

  // Every segment is kernel-wide: the state, the count, and the timer follow
  // the kernel process across all of its clients, so a cell run from a
  // console attached to the same kernel reads exactly like one run here.
  segments(kernel) {
    const isBusy = kernel.executionState === "busy";
    const segments = [kernel.displayName, kernel.executionState];

    if (this.showKernelInfo) {
      segments.push(kernel.executionCount);
      if (isBusy) {
        segments.push(formatElapsedTime(this.elapsedMs));
      } else if (kernel.executionCount !== 0) {
        segments.push(kernel.lastExecutionTime);
      }
    } else if (isBusy) {
      segments.push(formatElapsedTime(this.elapsedMs));
    }

    return segments.join(" | ");
  }

  get isHidden() {
    return this.disabled || !this.store.kernel;
  }

  render() {
    // Etch keeps one DOM element per component, so the root tag stays an anchor
    // whether or not there is anything to show; the tile itself is hidden in
    // writeAfterUpdate.
    const kernel = this.isHidden ? null : this.store.kernel;
    return <a onClick={this.handleClick}>{kernel ? this.segments(kernel) : ""}</a>;
  }

  // A DOM write that belongs to the surrounding tile rather than to this
  // component's own tree, so etch runs it after the patch.
  writeAfterUpdate() {
    if (this.container) {
      this.container.style.display = this.isHidden ? "none" : "";
    }
  }

  handleClick = () => {
    this.onClick?.({ kernel: this.store.kernel, markers: this.store.markers });
  };

  update() {
    return etch.update(this);
  }

  destroy() {
    this.disposables.dispose();
    return etch.destroy(this);
  }
}

module.exports = StatusBar;
