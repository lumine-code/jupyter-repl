/*
 * The `jupyterKernel` class wraps Jupyter's internal representation of kernels
 * and exposes a small set of methods that should be usable by plugins.
 * @class JupyterKernel
 */

const { OUTPUT_TYPES } = require("../output-utils");
const { activeSurfaceInputRoute } = require("../input-route");

class JupyterKernel {
  /**
   * How long `complete` and `inspect` wait by default. Generous for an answer
   * a kernel produces in milliseconds, and short enough that a caller with a
   * user in front of it is not left holding a promise that will never settle.
   */
  static INTROSPECT_TIMEOUT_MS = 10000;

  constructor(_kernel) {
    this._kernel = _kernel;
    this.destroyed = false;
  }

  _executionRoute() {
    // Plugin executions do not have an owner in their public contract. Capture
    // the active native surface synchronously, before any request is sent.
    return activeSurfaceInputRoute();
  }

  /*
   * Execute code in the kernel and return a Promise with the result.
   * This is the recommended way to execute code from plugins.
   *
   * @param {String} code - The code to execute
   * @param {Object} [options]
   * @param {Number} [options.timeoutMs] - Give up waiting after this long and
   *   resolve with whatever arrived, `status: 'timeout'`. Without it the
   *   promise settles only when the kernel replies, so code that never
   *   finishes — a `while True:`, a blocked socket — leaves it pending for the
   *   life of the window. The kernel keeps running either way: a caller that
   *   wants it stopped calls `interrupt()`, which is a decision this cannot
   *   make on the caller's behalf.
   * @return {Promise<Object>} Promise that resolves with
   *   - status: 'ok', 'error', or 'timeout'
   *   - outputs: the notebook-format outputs received, in order
   *   - executionCount: the number this execution was given, or null
   *   - error: { ename, evalue, traceback } (only present when status is 'error')
   */
  execute(code, options = {}) {
    this._assertNotDestroyed();
    const inputRoute = this._executionRoute();

    return new Promise((resolve) => {
      const outputs = [];
      let error = null;
      let executionCount = null;
      let timer = null;
      let settled = false;

      const settle = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        resolve({ executionCount, ...result });
      };

      if (options.timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = null;
          // Timing out stops this promise waiting; the execution itself runs
          // on, and its callback stays registered.
          settle({ status: "timeout", outputs });
        }, options.timeoutMs);
      }

      this._kernel.execute(
        code,
        (result) => {
          // Nothing will read `outputs` again once this has settled, and the
          // runaway loop a timeout exists for would keep filling it until the
          // kernel was restarted.
          if (settled) {
            return;
          }
          // Everything from iopub arrives already in notebook format, and the
          // kernel's own control messages are the ones carrying `stream`.
          //
          // Collecting on `result.data` instead — as this did — kept only
          // execute_result and display_data. A `stream` output holds its content
          // in `text` and an `error` output in `ename`/`evalue`/`traceback`, so
          // everything printed and every traceback was dropped, while the
          // execution_count control message was pushed as though it were output.
          if (result.stream === "status") {
            if (result.data === "ok") {
              settle({ status: "ok", outputs });
            } else {
              settle({
                status: "error",
                outputs,
                error: error || { ename: "Error", evalue: "Unknown error", traceback: [] },
              });
            }
          } else if (result.stream === "execution_count") {
            executionCount = result.data;
          } else if (OUTPUT_TYPES.includes(result.output_type)) {
            if (result.output_type === "error") {
              error = {
                ename: result.ename || "Error",
                evalue: result.evalue || "Unknown error",
                traceback: result.traceback || [],
              };
            }
            outputs.push(result);
          }
        },
        inputRoute,
      );
    });
  }

  /*
   * Execute code in the kernel with a callback for each result.
   * This gives access to raw Jupyter-internal result format.
   *
   * @param {String} code - The code to execute
   * @param {Function} onResults - Callback called with each result
   *   Result format: { data, stream } where stream is 'status', 'error', 'execution_count', etc.
   */
  executeWithCallback(code, onResults) {
    this._assertNotDestroyed();
    const inputRoute = this._executionRoute();
    this._kernel.execute(code, onResults, inputRoute);
  }

  /*
   * Execute code without it counting as the user's own execution: the status
   * bar's counter and timer ignore it, and it takes no execution number. This
   * is how a panel asks the kernel a question — what variables exist, what does
   * this expression hold — without appearing to have run a cell.
   *
   * @param {String} code - The code to execute
   * @param {Function} onResults - Callback called with each result
   */
  executeWatch(code, onResults) {
    this._assertNotDestroyed();

    this._kernel.executeWatch(code, onResults);
  }

  // ========== Kernel State & Control ==========

  /*
   * Get the current execution state of the kernel.
   * @return {String} 'idle', 'busy', 'starting', or other states
   */
  get executionState() {
    this._assertNotDestroyed();
    return this._kernel.executionState;
  }

  /*
   * Get the current execution count.
   * @return {Number} The execution count
   */
  get executionCount() {
    this._assertNotDestroyed();
    return this._kernel.executionCount;
  }

  /*
   * Get the last execution time as a formatted string.
   * @return {String} e.g., "1.23s" or "Running ..."
   */
  get lastExecutionTime() {
    this._assertNotDestroyed();
    return this._kernel.lastExecutionTime;
  }

  /*
   * When the running execution started, as a timestamp, or `null` when idle.
   * A consumer showing a live counter measures from here, so its value agrees
   * with the one the kernel finally reports.
   * @return {Number|null}
   */
  get executionStartTime() {
    this._assertNotDestroyed();
    return this._kernel.executionStartTime;
  }

  /*
   * The grammar this kernel was started for.
   * @return {Grammar}
   */
  get grammar() {
    this._assertNotDestroyed();
    return this._kernel.grammar;
  }

  /*
   * Subscribe to execution state changes.
   * @param {Function} callback - Called with the new state ('idle', 'busy', etc.)
   * @return {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    this._assertNotDestroyed();
    return this._kernel.onDidChangeExecutionState(callback);
  }

  /*
   * Subscribe to any change in what the status bar shows: the execution state,
   * the count, the last execution time, or the start time. Coarser than
   * `onDidChangeExecutionState`; read the values off the kernel.
   *
   * @param {Function} callback
   * @return {Disposable}
   */
  onDidChangeStatus(callback) {
    this._assertNotDestroyed();
    return this._kernel.onDidChangeStatus(callback);
  }

  /*
   * Subscribe to the kernel finishing its work and going idle — the point at
   * which anything watching the session should refetch.
   *
   * @param {Function} callback
   * @return {Disposable}
   */
  onDidBecomeIdle(callback) {
    this._assertNotDestroyed();
    return this._kernel.onDidBecomeIdle(callback);
  }

  /*
   * Interrupt the currently running execution.
   */
  interrupt() {
    this._assertNotDestroyed();
    this._kernel.interrupt();
  }

  /*
   * Restart the kernel.
   * @param {Function} [onRestarted] - Optional callback when restart completes
   */
  restart(onRestarted) {
    this._assertNotDestroyed();
    this._kernel.restart(onRestarted);
  }

  /*
   * Shut the kernel down and release it: sockets closed, process ended, and
   * the kernel removed from the running list. For a consumer "shutdown" means
   * "gone" — leaving the dead kernel registered kept it in every list and,
   * worse, kept files mapped to it, so the next run executed into the corpse
   * instead of starting a fresh kernel. This package's own UI always pairs
   * shutdown() with destroy(); the service does the same.
   *
   * @return {Promise} Settles once the kernel is gone. Awaiting it is what
   *   lets the kernel run its own teardown before the process is killed.
   */
  shutdown() {
    this._assertNotDestroyed();
    return this._kernel.shutdownAndDestroy();
  }

  // ========== Introspection ==========

  /*
   * Get code completions at a position.
   * @param {String} code - The code to complete
   * @param {Object} [options]
   * @param {Number} [options.timeoutMs] - Give up waiting after this long and
   *   resolve with `status: 'timeout'` and no matches. Unlike `execute` this
   *   is defaulted, and deliberately: a long-running cell is doing what the
   *   user asked, but there is no such thing as a long-running completion —
   *   a kernel answers in milliseconds or it is not going to. Pass 0 to wait
   *   for as long as it takes.
   * @return {Promise<Object>} Promise resolving to completion results
   */
  complete(code, options = {}) {
    this._assertNotDestroyed();

    return this._introspect(
      (callback) => this._kernel.complete(code, callback),
      options.timeoutMs,
      { status: "timeout", matches: [] },
    );
  }

  /*
   * Inspect code at a position (get documentation/signature).
   * @param {String} code - The code to inspect
   * @param {Number} cursorPos - Cursor position in the code
   * @param {Object} [options]
   * @param {Number} [options.timeoutMs] - As in `complete`.
   * @return {Promise<Object>} Promise resolving to { data, found }
   */
  inspect(code, cursorPos, options = {}) {
    this._assertNotDestroyed();

    return this._introspect(
      (callback) => this._kernel.inspect(code, cursorPos, callback),
      options.timeoutMs,
      { status: "timeout", data: {}, found: false },
    );
  }

  /**
   * Both introspection calls, which differ only in what they ask and what a
   * timeout should look like. The timeout resolves with a valid degenerate
   * answer of the request's own shape rather than rejecting, so a caller that
   * does not check `status` reads it as "nothing found" instead of throwing.
   *
   * The transports settle their own requests when a kernel goes away, so this
   * is the backstop for the two cases they cannot cover: a websocket
   * connection that drops without JupyterLab disposing its futures, and a
   * plugin middleware that never calls the callback it was handed.
   */
  _introspect(send, timeoutMs = JupyterKernel.INTROSPECT_TIMEOUT_MS, onTimeout) {
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;

      const settle = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(result);
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timer = null;
          settle(onTimeout);
        }, timeoutMs);
      }

      send((results) => settle(results));
    });
  }

  // ========== Kernel Info ==========

  /*
   * A stable identifier for this kernel within the window.
   *
   * `displayName` is the kernelspec's, so two Python 3 kernels share it, and
   * `getConnectionFile()` throws for a kernel reached over a websocket. This
   * is what a consumer holding several kernels names one by.
   *
   * @return {String} e.g. "kernel-3"
   */
  get id() {
    this._assertNotDestroyed();
    return this._kernel.id;
  }

  /*
   * Get the full kernel spec object.
   * @return {Object} The kernel spec
   */
  get kernelSpec() {
    this._assertNotDestroyed();
    return this._kernel.kernelSpec;
  }

  _assertNotDestroyed() {
    // Internal: plugins might hold references to long-destroyed kernels, so
    // all API calls should guard against this case
    if (this.destroyed) {
      throw new Error("jupyterKernel: operation not allowed because the kernel has been destroyed");
    }
  }

  /*
   * The language of the kernel, as specified in its kernelspec
   */
  get language() {
    this._assertNotDestroyed();

    return this._kernel.language;
  }

  /*
   * The display name of the kernel, as specified in its kernelspec
   */
  get displayName() {
    this._assertNotDestroyed();

    return this._kernel.displayName;
  }

  /*
   * Add a kernel middleware, which allows intercepting and issuing commands to
   * the kernel.
   *
   * If the methods of a `middleware` object are added/modified/deleted after
   * `addMiddleware` has been called, the changes will take effect immediately.
   *
   * @param {JupyterKernelMiddleware} middleware
   */
  addMiddleware(middleware) {
    this._assertNotDestroyed();

    this._kernel.addMiddleware(middleware);
  }

  /*
   * Calls your callback when the kernel has been destroyed.
   * @param {Function} Callback
   */
  onDidDestroy(callback) {
    this._assertNotDestroyed();

    this._kernel.emitter.on("did-destroy", callback);
  }

  /*
   * Get the [connection file](http://jupyter-notebook.readthedocs.io/en/latest/examples/Notebook/Connecting%20with%20the%20Qt%20Console.html) of the kernel.
   * @return {String} Path to connection file.
   */
  getConnectionFile() {
    this._assertNotDestroyed();

    // $FlowFixMe
    const connectionFile = this._kernel.transport.connectionFile
      ? this._kernel.transport.connectionFile
      : null;

    if (!connectionFile) {
      throw new Error(
        `No connection file for ${this._kernel.kernelSpec.display_name} kernel found`,
      );
    }

    return connectionFile;
  }
}

module.exports = JupyterKernel;
