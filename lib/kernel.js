const { CompositeDisposable, Disposable, Emitter } = require("lumine");

const { log, msgSpecToNotebookFormat } = require("./utils");
const OutputStore = require("./store/output");
const JupyterKernel = require("./plugin-api/jupyter-kernel");
const InputView = require("./input-view");
const KernelTransport = require("./kernel-transport");

let nextKernelId = 1;

/** Let a callback through once, whatever answers after that. */
function once(callback) {
  let called = false;
  return (...args) => {
    if (called) {
      return;
    }
    called = true;
    callback(...args);
  };
}

function protectFromInvalidMessages(onResults) {
  const wrappedOnResults = (message, channel) => {
    if (!message) {
      log("Invalid message: null");
      return;
    }

    if (!message.content) {
      log("Invalid message: Missing content");
      return;
    }

    if (message.content.execution_state === "starting") {
      // Kernels send a starting status message with an empty parent_header
      log("Dropped starting status IO message");
      return;
    }

    if (!message.parent_header) {
      log("Invalid message: Missing parent_header");
      return;
    }

    if (!message.parent_header.msg_id) {
      log("Invalid message: Missing parent_header.msg_id");
      return;
    }

    if (!message.parent_header.msg_type) {
      log("Invalid message: Missing parent_header.msg_type");
      return;
    }

    if (!message.header) {
      log("Invalid message: Missing header");
      return;
    }

    if (!message.header.msg_id) {
      log("Invalid message: Missing header.msg_id");
      return;
    }

    if (!message.header.msg_type) {
      log("Invalid message: Missing header.msg_type");
      return;
    }

    onResults(message, channel);
  };

  return wrappedOnResults;
} // Adapts middleware objects provided by plugins to an internal interface. In
// particular, this implements fallthrough logic for when a plugin defines some
// methods (e.g. execute) but doesn't implement others (e.g. interrupt). Note
// that JupyterKernelMiddleware objects are mutable: they may lose/gain methods
// at any time, including in the middle of processing a request. This class also
// adds basic checks that messages passed via the `onResults` callbacks are not
// missing key mandatory fields specified in the Jupyter messaging spec.

class MiddlewareAdapter {
  constructor(middleware, next) {
    this._middleware = middleware;
    this._next = next;
  }

  // The return value of this method gets passed to plugins! For now we just
  // return the MiddlewareAdapter object itself, which is why all private
  // functionality is prefixed with _, and why MiddlewareAdapter is marked as
  // implementing JupyterKernelMiddlewareThunk. Once multiple plugin API
  // versions exist, we may want to generate a JupyterKernelMiddlewareThunk
  // specialized for a particular plugin API version.
  get _nextAsPluginType() {
    if (this._next instanceof KernelTransport) {
      throw new Error(
        "MiddlewareAdapter: _nextAsPluginType must never be called when _next is KernelTransport",
      );
    }

    return this._next;
  }

  interrupt() {
    if (this._middleware.interrupt) {
      this._middleware.interrupt(this._nextAsPluginType);
    } else {
      this._next.interrupt();
    }
  }

  shutdown() {
    // Returned, not just called: a caller destroys the kernel once this
    // settles, and destroying it kills the process.
    if (this._middleware.shutdown) {
      return this._middleware.shutdown(this._nextAsPluginType);
    }
    return this._next.shutdown();
  }

  restart(onRestarted) {
    if (this._middleware.restart) {
      this._middleware.restart(this._nextAsPluginType, onRestarted);
    } else {
      this._next.restart(onRestarted);
    }
  }

  execute(code, onResults) {
    // We don't want to repeatedly wrap the onResults callback every time we
    // fall through, but we need to do it at least once before delegating to
    // the KernelTransport.
    const safeOnResults =
      this._middleware.execute || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.execute) {
      this._middleware.execute(this._nextAsPluginType, code, safeOnResults);
    } else {
      this._next.execute(code, safeOnResults);
    }
  }

  complete(code, onResults) {
    const safeOnResults =
      this._middleware.complete || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.complete) {
      this._middleware.complete(this._nextAsPluginType, code, safeOnResults);
    } else {
      this._next.complete(code, safeOnResults);
    }
  }

  inspect(code, cursorPos, onResults) {
    const safeOnResults =
      this._middleware.inspect || this._next instanceof KernelTransport
        ? protectFromInvalidMessages(onResults)
        : onResults;

    if (this._middleware.inspect) {
      this._middleware.inspect(this._nextAsPluginType, code, cursorPos, safeOnResults);
    } else {
      this._next.inspect(code, cursorPos, safeOnResults);
    }
  }

  /**
   * Send input reply to kernel in response to input_request message.
   * This method follows the middleware pattern for consistency with other kernel operations.
   *
   * @param {String} input - The user input to send to the kernel
   */
  inputReply(input) {
    if (this._middleware.inputReply) {
      this._middleware.inputReply(this._nextAsPluginType, input);
    } else {
      this._next.inputReply(input);
    }
  }
}

class Kernel {
  // How long a burst of idle transitions coalesces into one watch refetch. A
  // chatty console produces many per second; the panels only need the last.
  static WATCH_REFETCH_DEBOUNCE_MS = 200;
  // How long shutdownAndDestroy waits for a graceful shutdown before tearing
  // down regardless. Longer than ZMQKernel.SHUTDOWN_TIMEOUT_MS, so a local
  // kernel's own bounded wait is never cut short from above.
  static SHUTDOWN_DESTROY_TIMEOUT_MS = 5000;

  outputStore = new OutputStore();
  watchCallbacks = [];
  emitter = new Emitter();
  pluginWrapper = null;
  // Every execution this client has asked for and not yet seen finish. Each
  // entry can push terminal messages through its own results callback, which
  // is what lets a restart or a dead kernel settle the inline bubble, the
  // output area, and the awaiting createResultAsync promise in one stroke —
  // no registry of views required, the messages reach whatever is listening.
  _inFlight = new Map();
  _nextExecutionToken = 1;
  // Watch executions outstanding right now; their own idles must not
  // re-trigger the watches (see executeWatch).
  _watchExecutionDepth = 0;
  _watchCallbackTimer = null;

  constructor(kernel) {
    this.id = `kernel-${nextKernelId++}`;
    this.transport = kernel;
    // A MiddlewareAdapter that forwards all requests to `this.transport`.
    // Needed to terminate the middleware chain in a way such that the `next`
    // object passed to the last middleware is not the KernelTransport instance
    // itself (which would be violate isolation of internals from plugins).
    const delegateToTransport = new MiddlewareAdapter({}, this.transport);
    this.middleware = [delegateToTransport];
    // The transport knows when the kernel process is gone; the executions that
    // will now never finish are this class's to settle.
    this._lostKernelSubscription = this.transport.onDidLoseKernel?.((reason) =>
      this.abortInFlight(reason),
    );
    // The kernel falling idle — any client's cell finishing — is what watches
    // and the variable explorer refetch on.
    this._idleSubscription = this.transport.onDidBecomeIdle?.(() => this._scheduleWatchCallbacks());
    this._claimWidgetTargets();
  }

  /**
   * Claim the ipywidgets comm targets, now, while the kernel is still empty.
   *
   * A target registered only once a widget is displayed would miss the
   * comm_open that announces it: the kernel opens the comm before it publishes
   * the view, and a target it finds unclaimed it never offers again. Claiming
   * costs a map entry — the widget stack is loaded inside the handler, so a
   * kernel that never sees a widget never parses it.
   */
  _claimWidgetTargets() {
    if (!this.transport.supportsComms) {
      return;
    }
    const widgets = () => require("./widget-manager").managerFor(this);
    this._commTargets = new CompositeDisposable(
      this.transport.registerCommTarget("jupyter.widget", (comm, message) =>
        widgets().handleCommOpen(comm, message),
      ),
      this.transport.registerCommTarget("jupyter.widget.control", (comm, message) =>
        widgets().handleControlCommOpen(comm, message),
      ),
    );
  }

  /**
   * This kernel's ipywidgets manager, or null when the transport cannot carry
   * comms. Built on first use, like the output store above.
   * @returns {Object|null}
   */
  get widgets() {
    if (!this.transport.supportsComms) {
      return null;
    }
    return require("./widget-manager").managerFor(this);
  }

  get kernelSpec() {
    return this.transport.kernelSpec;
  }

  get grammar() {
    return this.transport.grammar;
  }

  get language() {
    return this.transport.language;
  }

  get displayName() {
    return this.transport.displayName;
  }

  get firstMiddlewareAdapter() {
    return this.middleware[0];
  }

  addMiddleware(middleware) {
    this.middleware.unshift(new MiddlewareAdapter(middleware, this.middleware[0]));
  }

  get executionState() {
    return this.transport.executionState;
  }

  setExecutionState(state) {
    this.transport.setExecutionState(state);
  }

  /**
   * Subscribe to execution state changes.
   * This is the preferred way to monitor kernel status from external packages.
   * @param {Function} callback - Called with the new state ('idle', 'busy', 'loading', etc.)
   * @returns {Disposable} Subscription that can be disposed to unsubscribe
   */
  onDidChangeExecutionState(callback) {
    return this.transport.onDidChangeExecutionState(callback);
  }

  get executionCount() {
    return this.transport.executionCount;
  }

  setExecutionCount(count) {
    this.transport.setExecutionCount(count);
  }

  get lastExecutionTime() {
    return this.transport.lastExecutionTime;
  }

  setLastExecutionTime(timeString) {
    this.transport.setLastExecutionTime(timeString);
  }

  get executionStartTime() {
    return this.transport.executionStartTime;
  }

  getPluginWrapper() {
    if (!this.pluginWrapper) {
      this.pluginWrapper = new JupyterKernel(this);
    }

    return this.pluginWrapper;
  }

  /**
   * Invoke the callback when the kernel finishes executing and falls idle —
   * any client's work, not only this editor's — the point at which watches
   * and the variable explorer refetch. Bursts are debounced, and idles caused
   * by the watch refetches themselves are skipped.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidBecomeIdle(callback) {
    this.watchCallbacks.push(callback);
    return new Disposable(() => {
      const index = this.watchCallbacks.indexOf(callback);
      if (index > -1) {
        this.watchCallbacks.splice(index, 1);
      }
    });
  }

  /**
   * Subscribe to any change of the kernel's execution status: state, count,
   * last execution time, or start time.
   * @param {Function} callback
   * @returns {Disposable}
   */
  onDidChangeStatus(callback) {
    return this.transport.onDidChangeStatus(callback);
  }

  interrupt() {
    this.firstMiddlewareAdapter.interrupt();
  }

  /**
   * Ask the kernel to shut down and wait for it. Callers pair this with
   * `destroy()`, which kills the process — so awaiting is what gives the
   * kernel the chance to run its own teardown first.
   *
   * @return {Promise}
   */
  shutdown() {
    return Promise.resolve(this.firstMiddlewareAdapter.shutdown());
  }

  /**
   * The pairing every caller wants: ask the kernel to go, then tear down.
   * Shutdown alone leaves the dead kernel registered — still listed, with
   * files still mapped to it — and destroy alone kills a local process before
   * it can run its own teardown, and does not shut a WSKernel down at all.
   *
   * The destroy happens even if the request fails; a kernel that will not
   * answer still has to be let go of.
   *
   * @return {Promise}
   */
  shutdownAndDestroy() {
    // Latched: a second call — a double keypress, shutdownAllKernels racing
    // the UI command — must join the first, not race it. Unlatched, the
    // repeat failed instantly on the already-released transport and its
    // destroy SIGKILLed the kernel in the middle of the very atexit the
    // first request started.
    return (this._shutdownAndDestroy ??= this._shutdownAndDestroyOnce());
  }

  async _shutdownAndDestroyOnce() {
    try {
      // Bounded above the transports' own patience: ZMQ waits up to 2s for
      // the process to exit, but a WS session shutdown is an HTTP DELETE
      // with no timeout anywhere on its path — against an unreachable
      // gateway the kernel stayed listed and file-mapped for as long as the
      // network stack took to fail, because the destroy that removes it sat
      // behind that await.
      let timer = null;
      await Promise.race([
        this.shutdown(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, Kernel.SHUTDOWN_DESTROY_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(timer);
    } catch (error) {
      log("Kernel: Error shutting down:", error);
    } finally {
      this.destroy();
    }
  }

  restart(onRestarted) {
    // The old process takes every outstanding execution with it; settle them
    // now so their bubbles say why and their awaiting promises resolve.
    this.abortInFlight("Kernel restarted");
    this.firstMiddlewareAdapter.restart(() => {
      this.setExecutionCount(0);
      this.setLastExecutionTime("No execution");
      if (onRestarted) {
        onRestarted();
      }
    });
  }

  /**
   * Set the output store for background thread output routing.
   * @param {OutputStore} outputStore - The output store to receive orphan messages
   */
  setLastOutputStore(outputStore) {
    if (this.transport.setLastOutputStore) {
      this.transport.setLastOutputStore(outputStore);
    }
  }

  execute(code, onResults) {
    const wrappedOnResults = this._wrapExecutionResultsCallback(onResults);
    const token = this._nextExecutionToken++;
    // `onResults` speaks the internal result format, so an aborted entry can be
    // settled by pushing the same terminal messages the kernel would have sent.
    const entry = {
      onResults,
      settled: false,
      startedAt: Date.now(),
      durationMs: null,
      replySeen: false,
      idleSeen: false,
    };
    this._inFlight.set(token, entry);

    this.firstMiddlewareAdapter.execute(code, (message, channel) => {
      if (entry.settled && !this._inFlight.has(token)) {
        // Settled by abortInFlight: the kernel died or restarted while this
        // was outstanding. Whatever straggles in afterwards is history.
        return;
      }
      // Bookkeeping first: a caller resolving on the forwarded message must
      // find the entry's duration already frozen. The status-bar fields — the
      // count, the running timer, the frozen span — are the transport's, fed
      // by every client's traffic; this entry times only its own execution,
      // which is what the bubble and the notebook cell record.
      const { msg_type } = message.header;

      if (msg_type === "execute_input") {
        // The kernel has started this cell. Measure from here, per entry, so
        // concurrent executions each report their own duration.
        entry.startedAt = Date.now();
      }

      if (msg_type === "execute_reply") {
        entry.durationMs = Date.now() - entry.startedAt;
        entry.replySeen = true;
        entry.settled = true;
      }

      const isIdle =
        channel == "iopub" && msg_type === "status" && message.content.execution_state === "idle";
      if (isIdle) {
        entry.idleSeen = true;
      }

      wrappedOnResults(message, channel);

      if (entry.replySeen && entry.idleSeen) {
        this._inFlight.delete(token);
      }
    });

    return entry;
  }

  /**
   * Settle every outstanding execution with an error, through each one's own
   * results callback: the bubble shows why, the output area logs it, and any
   * promise awaiting the execution resolves instead of hanging. Called when
   * the kernel restarts, is destroyed, or its process dies — the three cases
   * where the kernel itself will never answer again.
   * @param {String} reason - Shown in the error output.
   */
  abortInFlight(reason) {
    const entries = [...this._inFlight.values()];
    this._inFlight.clear();
    for (const entry of entries) {
      // Guarded per entry: everything here is already out of the map, so a
      // consumer that throws — plugin result hooks ride these callbacks —
      // must not strand the entries behind it, unreachable by any future
      // settle.
      try {
        if (entry.settled) {
          // Settled by its reply, still waiting on its idle — and the idle is
          // what a batch's promise resolves on and what releases a watch's
          // hold on every watch pane in the window. The abort's own straggler
          // guard drops whatever the transport synthesizes later, so this is
          // the last hand that can deliver it; release is latch-idempotent, so
          // a real idle already seen makes this a no-op downstream.
          if (!entry.idleSeen) {
            entry.onResults({ output_type: "status", execution_state: "idle" });
          }
          continue;
        }
        entry.settled = true;
        entry.onResults({
          output_type: "error",
          ename: "ExecutionAborted",
          evalue: reason,
          traceback: [],
        });
        entry.onResults({ data: "error", stream: "status" });
        entry.onResults({ output_type: "status", execution_state: "idle" });
      } catch (error) {
        console.error("jupyter-repl: abort delivery failed:", error);
      }
    }
  }

  executeWatch(code, onResults) {
    // A watch refetch is itself an execution, and on a transport with no
    // status suppression (WS) its own idle would re-trigger every watch —
    // N watches re-running N watches, without end. Hold the idle callbacks
    // while any watch execution is outstanding; watches poll on every later
    // idle anyway, so a dropped tick costs nothing.
    this._watchExecutionDepth++;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this._watchExecutionDepth--;
      }
    };
    // A watch rides `_inFlight` like any execution: a restart or a dead
    // process settles it through `abortInFlight`'s terminal messages, which
    // is what releases the caller's own one-at-a-time latch — and the hold
    // above, without which one badly-timed restart would stop every watch
    // refetch for the life of the kernel. Releasing on the idle *result*
    // rather than in the transport callback is what lets both paths — the
    // kernel answering and the abort standing in for it — share the release.
    const token = this._nextExecutionToken++;
    const entry = {
      settled: false,
      replySeen: false,
      idleSeen: false,
      onResults: (result) => {
        if (result.output_type === "status" && result.execution_state === "idle") {
          release();
        }
        onResults(result);
      },
    };
    this._inFlight.set(token, entry);

    const wrappedOnResults = this._wrapExecutionResultsCallback(entry.onResults);
    this.transport.executeWatch(code, (message, channel) => {
      if (entry.settled && !this._inFlight.has(token)) {
        // Settled by abortInFlight: the kernel died or restarted while this
        // was outstanding. Whatever straggles in afterwards is history.
        return;
      }
      const { msg_type } = message.header;
      if (msg_type === "execute_reply") {
        entry.replySeen = true;
        entry.settled = true;
      }
      if (
        channel === "iopub" &&
        msg_type === "status" &&
        message.content.execution_state === "idle"
      ) {
        entry.idleSeen = true;
      }

      wrappedOnResults(message, channel);

      // Retired like any execution: only once the kernel has said everything
      // it will say — the reply and the trailing idle arrive in either order.
      if (entry.replySeen && entry.idleSeen) {
        this._inFlight.delete(token);
      }
    });
  }

  /**
   * The kernel fell idle — any client's cell finished, or several did in
   * quick succession. Coalesce the burst and skip ticks caused by our own
   * watch refetches, then let watches and the variable explorer refetch once.
   */
  _scheduleWatchCallbacks() {
    if (this._watchCallbackTimer) {
      clearTimeout(this._watchCallbackTimer);
    }
    this._watchCallbackTimer = setTimeout(() => {
      this._watchCallbackTimer = null;
      if (this._watchExecutionDepth > 0) {
        return;
      }
      this._callWatchCallbacks();
    }, Kernel.WATCH_REFETCH_DEBOUNCE_MS);
  }

  _callWatchCallbacks() {
    this.watchCallbacks.forEach((watchCallback) => watchCallback());
  }

  /*
   * Takes a callback that accepts execution results in a jupyter-repl-internal
   * format and wraps it to accept Jupyter message/channel pairs instead.
   * Kernels and plugins all operate on types specified by the Jupyter messaging
   * protocol in order to maximize compatibility, but jupyter-repl internally uses
   * its own types.
   */
  _wrapExecutionResultsCallback(onResults) {
    return (message, channel) => {
      if (channel === "shell") {
        const { status, payload } = message.content;

        // Handle payload (used by IPython for ? and ?? introspection)
        // Payload is a list of paged outputs that should be displayed as results
        // See: https://jupyter-client.readthedocs.io/en/latest/messaging.html#payloads-deprecated
        if (payload && Array.isArray(payload)) {
          for (const item of payload) {
            if (item.source === "page" && item.data) {
              // Convert pager payload to display_data format
              onResults({
                output_type: "display_data",
                data: item.data,
                metadata: {},
              });
            }
          }
        }

        if (status === "error" || status === "ok") {
          onResults({
            data: status,
            stream: "status",
          });
        } else {
          log("Kernel: unexpected value for message.content.status:", status);
          // Still send a status to avoid hanging - treat unknown status as error
          onResults({
            data: "error",
            stream: "status",
          });
        }
      } else if (channel === "iopub") {
        if (message.header.msg_type === "execute_input") {
          onResults({
            data: message.content.execution_count,
            stream: "execution_count",
          });
        }

        const result = msgSpecToNotebookFormat(message);
        onResults(result);
      } else if (channel === "stdin") {
        if (message.header.msg_type !== "input_request") {
          return;
        }

        const { prompt, password } = message.content;

        // Input replies now go through middleware, allowing plugins to intercept
        // or modify input handling (e.g., for automated testing, logging, or custom UI)
        let inputView = null;
        try {
          inputView = new InputView(
            {
              prompt,
              password,
            },
            (input) => this.firstMiddlewareAdapter.inputReply(input),
            // The primary window or a competing modal may end this prompt
            // while the kernel waits. Jupyter has no separate cancellation
            // message, so an empty reply is the one terminal cancellation
            // policy and always releases stdin.
            () => this.firstMiddlewareAdapter.inputReply(""),
          );
          inputView.attach();
        } catch (error) {
          if (inputView) inputView.cancel();
          else this.firstMiddlewareAdapter.inputReply("");
          console.error("jupyter-repl: unable to present kernel input:", error);
        }
      }
    };
  }

  complete(code, onResults) {
    // The transports answer once, but a plugin's middleware is under no such
    // obligation, and the caller resolves a promise on the first answer.
    const answer = once(onResults);
    this.firstMiddlewareAdapter.complete(code, (message, channel) => {
      // Only the shell reply carries completions. One callback is registered
      // for the whole request, so it also sees the busy/idle pair the kernel
      // publishes around any shell message — expected traffic, not a fault,
      // and there are two of them for every keystroke.
      if (channel !== "shell") {
        return;
      }

      answer(message.content);
    });
  }

  inspect(code, cursorPos, onResults) {
    const answer = once(onResults);
    this.firstMiddlewareAdapter.inspect(code, cursorPos, (message, channel) => {
      // As in `complete`: the reply is on shell, the status pair is not.
      if (channel !== "shell") {
        return;
      }

      const { data, found, status, ename, evalue } = message.content;
      // A settled-with-error reply reaches here whenever the kernel went away
      // mid-request. Reported as `{found: false}` alone it is indistinguishable
      // from the kernel looking and knowing nothing — which is what the MCP
      // inspect tool would then tell the assistant. The documented shape
      // holds either way: `data` an object, `found` a boolean.
      answer(
        status === "error"
          ? { data: data ?? {}, found: Boolean(found), status, ename, evalue }
          : { data, found },
      );
    });
  }

  /**
   * @param {Boolean} [forUnload=false] - True only at window teardown, where
   *   the zmq observers must close immediately (no later event-loop turn will
   *   self-close them) and socket closes must not defer.
   */
  destroy(forUnload = false) {
    log("Kernel: Destroying");

    // Prevent double destruction
    if (this._destroyed) return;
    this._destroyed = true;
    this._destroyForUnload = forUnload;

    // Settle outstanding executions before the transport goes down, so their
    // bubbles and promises are not left waiting on a kernel that is gone.
    this.abortInFlight("Kernel shut down");
    this._lostKernelSubscription?.dispose();
    this._idleSubscription?.dispose();
    // The manager itself rides the transport's did-reset-comms, which
    // _clearState fires on the way down; these are only the target claims.
    this._commTargets?.dispose();
    // did-reset-comms drops the models but not the manager, which the registry
    // holds strongly against this kernel's id — so without this every kernel
    // that ever showed a widget kept its manager, models, views and their DOM
    // for the life of the window, one set per kernel and per restart. The
    // registry is the dependency-free half of the widget code, so a kernel that
    // never saw a widget still tears down without loading the bundle.
    try {
      require("./widget-registry").releaseHost(this.id);
    } catch (e) {
      log("Kernel: Error releasing the widget host:", e);
    }
    if (this._watchCallbackTimer) {
      clearTimeout(this._watchCallbackTimer);
      this._watchCallbackTimer = null;
    }

    // This is for cleanup to improve performance
    try {
      // Required here rather than at module scope: the store imports this
      // module, so a static import would close a load-time cycle.
      require("./store").deleteKernel(this);
    } catch (e) {
      log("Kernel: Error deleting kernel from store:", e);
    }

    try {
      this.transport.destroy(this._destroyForUnload === true);
    } catch (e) {
      log("Kernel: Error destroying transport:", e);
    }

    if (this.pluginWrapper) {
      this.pluginWrapper.destroyed = true;
    }

    try {
      this.emitter.emit("did-destroy");
      this.emitter.dispose();
    } catch (e) {
      log("Kernel: Error disposing emitter:", e);
    }
  }
}

module.exports = Kernel;
