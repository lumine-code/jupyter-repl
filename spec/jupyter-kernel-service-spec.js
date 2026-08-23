const { Emitter, CompositeDisposable } = require("lumine");
const JupyterProvider = require("../lib/plugin-api/jupyter-provider");
const store = require("../lib/store");

// `jupyter.kernel` is the seam the panels move across when they become their
// own packages, so it has to answer the questions a panel actually asks. Two
// of them it answered wrongly: asking for the active kernel when none was
// running threw rather than returning null, and subscribing returned nothing,
// so the documented example added undefined to a CompositeDisposable.

function fakeInternalKernel(name = "Python 3") {
  const wrapper = {
    displayName: name,
    language: "python",
    grammar: { name: "Python", scopeName: "source.python" },
  };
  return {
    displayName: name,
    grammar: wrapper.grammar,
    getPluginWrapper: () => wrapper,
    shutdown() {
      this.shutDown = true;
    },
    destroy() {
      this.destroyed = true;
    },
  };
}

describe("real JupyterKernel wrapper teardown", () => {
  const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

  // The monitor's shutdown button goes through the wrapper. Shutdown that
  // only sent the request left the dead kernel registered: still listed,
  // and with files still mapped to it, so the next run executed into the
  // corpse instead of starting a fresh kernel.
  it("shutdown releases the kernel, not just the process", () => {
    const internal = {
      shutDown: false,
      destroyed: false,
      shutdown() {
        this.shutDown = true;
      },
      destroy() {
        this.destroyed = true;
      },
    };
    const wrapper = new JupyterKernel(internal);

    wrapper.shutdown();

    expect(internal.shutDown).toBe(true);
    expect(internal.destroyed).toBe(true);
  });

  it("names the kernel by the id the window gave it", () => {
    // displayName is the kernelspec's, so two Python 3 kernels share it, and
    // getConnectionFile() throws for one reached over a websocket.
    expect(new JupyterKernel({ id: "kernel-3" }).id).toBe("kernel-3");
  });
});

// Everything from iopub reaches the callback already in notebook format, and
// the kernel's own control messages are the ones carrying `stream`. Collecting
// on `result.data` — as this did — kept only execute_result and display_data:
// a stream output holds its content in `text` and an error output in
// ename/evalue/traceback, so everything printed and every traceback went
// missing, while the execution_count control message was pushed as output.
describe("JupyterKernel#execute", () => {
  const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

  let internal, wrapper, emit;

  const STREAM = { output_type: "stream", name: "stdout", text: "hello\n" };
  const RESULT = { output_type: "execute_result", data: { "text/plain": "42" } };
  const ERROR = {
    output_type: "error",
    ename: "ValueError",
    evalue: "no",
    traceback: ["Traceback…", "ValueError: no"],
  };

  beforeEach(() => {
    internal = {
      execute(code, onResults) {
        emit = onResults;
      },
    };
    wrapper = new JupyterKernel(internal);
  });

  it("keeps what the code printed", async () => {
    const answer = wrapper.execute("print('hello')");
    emit({ data: 1, stream: "execution_count" });
    emit(STREAM);
    emit({ data: "ok", stream: "status" });

    const { status, outputs, executionCount } = await answer;
    expect(status).toBe("ok");
    expect(outputs).toEqual([STREAM]);
    expect(executionCount).toBe(1);
  });

  it("keeps a rich result alongside a stream", async () => {
    const answer = wrapper.execute("print('hello'); 42");
    emit(STREAM);
    emit(RESULT);
    emit({ data: "ok", stream: "status" });

    expect((await answer).outputs).toEqual([STREAM, RESULT]);
  });

  it("keeps the traceback, and reports the error on its own", async () => {
    const answer = wrapper.execute("raise ValueError('no')");
    emit(ERROR);
    emit({ data: "error", stream: "status" });

    const { status, outputs, error } = await answer;
    expect(status).toBe("error");
    expect(outputs).toEqual([ERROR]);
    expect(error).toEqual({
      ename: "ValueError",
      evalue: "no",
      traceback: ["Traceback…", "ValueError: no"],
    });
  });

  it("does not mistake the execution count for output", async () => {
    const answer = wrapper.execute("1");
    emit({ data: 7, stream: "execution_count" });
    emit({ data: "ok", stream: "status" });

    const { outputs, executionCount } = await answer;
    expect(outputs).toEqual([]);
    expect(executionCount).toBe(7);
  });

  describe("when the kernel never replies", () => {
    beforeEach(() => jasmine.useRealClock());

    // Without a timeout the promise stays pending for the life of the window,
    // which is what `while True:` in a cell used to do to every caller.
    it("gives up, keeping whatever arrived", async () => {
      const answer = wrapper.execute("while True: pass", { timeoutMs: 20 });
      emit(STREAM);

      const { status, outputs } = await answer;
      expect(status).toBe("timeout");
      expect(outputs).toEqual([STREAM]);
    });

    it("does not give up on a kernel that answers in time", async () => {
      const answer = wrapper.execute("1", { timeoutMs: 5000 });
      emit({ data: "ok", stream: "status" });

      expect((await answer).status).toBe("ok");
    });

    // The execution runs on after the timeout — that is what a timeout means
    // here — but nothing will read this array again. The runaway loop a
    // timeout exists for would fill it until the kernel was restarted.
    it("stops collecting output once it has given up", async () => {
      const answer = wrapper.execute("while True: print(1)", { timeoutMs: 20 });
      emit(STREAM);
      const { outputs } = await answer;
      expect(outputs.length).toBe(1);

      for (let i = 0; i < 100; i++) {
        emit(STREAM);
      }

      expect(outputs.length).toBe(1);
    });

    // A late reply must not resolve a promise that already settled as a
    // timeout, nor undo the guard above.
    it("ignores a reply that arrives after it gave up", async () => {
      const answer = wrapper.execute("slow()", { timeoutMs: 20 });
      const settled = await answer;
      expect(settled.status).toBe("timeout");

      emit(STREAM);
      emit({ data: "ok", stream: "status" });

      expect(settled.outputs.length).toBe(0);
      expect((await answer).status).toBe("timeout");
    });
  });
});

describe("jupyter.kernel service", () => {
  let emitter;
  let provider;
  let previousKernels;

  beforeEach(() => {
    emitter = new Emitter();
    provider = new JupyterProvider(emitter);
    previousKernels = store.runningKernels;
    store.runningKernels = [];
  });

  afterEach(() => {
    store.runningKernels = previousKernels;
    emitter.dispose();
  });

  it("reports no active kernel as null rather than throwing", () => {
    // A panel asks this before anything is running, every time.
    expect(() => provider.getActiveKernel()).not.toThrow();
    expect(provider.getActiveKernel()).toBe(null);
  });

  it("hands out the plugin wrapper for the active kernel", () => {
    const internal = fakeInternalKernel();
    Object.defineProperty(store, "kernel", { get: () => internal, configurable: true });

    expect(provider.getActiveKernel()).toBe(internal.getPluginWrapper());

    delete store.kernel;
  });

  it("returns a disposable subscription that stops firing", () => {
    const seen = [];
    const subscription = provider.onDidChangeKernel((kernel) => seen.push(kernel));

    // The documented example composes this; undefined would throw here.
    const composite = new CompositeDisposable();
    expect(() => composite.add(subscription)).not.toThrow();

    const internal = fakeInternalKernel();
    emitter.emit("did-change-kernel", internal);
    emitter.emit("did-change-kernel", null);
    expect(seen).toEqual([internal.getPluginWrapper(), null]);

    composite.dispose();
    emitter.emit("did-change-kernel", internal);
    expect(seen.length).toBe(2);
  });

  it("observes the active kernel: current value first, changes after", () => {
    const internal = fakeInternalKernel();
    Object.defineProperty(store, "kernel", { get: () => internal, configurable: true });

    const seen = [];
    const subscription = provider.observeActiveKernel((kernel) => seen.push(kernel));

    // The current value replays immediately — a consumer that renders state
    // must not depend on subscribing before the first change.
    expect(seen).toEqual([internal.getPluginWrapper()]);

    emitter.emit("did-change-kernel", null);
    expect(seen).toEqual([internal.getPluginWrapper(), null]);

    subscription.dispose();
    delete store.kernel;
  });

  it("lists the running kernels as wrappers", () => {
    const one = fakeInternalKernel("Python 3");
    const two = fakeInternalKernel("R");
    store.runningKernels = [one, two];

    expect(provider.getRunningKernels()).toEqual([one.getPluginWrapper(), two.getPluginWrapper()]);
  });

  it("announces kernels arriving and leaving", () => {
    const added = [];
    const removed = [];
    const subscriptions = new CompositeDisposable(
      provider.onDidAddKernel((kernel) => added.push(kernel)),
      provider.onDidRemoveKernel((kernel) => removed.push(kernel)),
    );

    const internal = fakeInternalKernel();
    store.emitter.emit("did-add-kernel", internal);
    store.emitter.emit("did-remove-kernel", internal);

    expect(added).toEqual([internal.getPluginWrapper()]);
    expect(removed).toEqual([internal.getPluginWrapper()]);
    subscriptions.dispose();
  });

  it("maps a wrapper back to the files its kernel serves", () => {
    const internal = fakeInternalKernel();
    store.runningKernels = [internal];
    spyOn(store, "getFilesForKernel").and.returnValue(["/tmp/a.py"]);

    expect(provider.getFilesForKernel(internal.getPluginWrapper())).toEqual(["/tmp/a.py"]);
    // A wrapper this window does not know about has no files, and no throw.
    expect(provider.getFilesForKernel({})).toEqual([]);
  });

  it("shuts every kernel down when asked", () => {
    const one = fakeInternalKernel("Python 3");
    const two = fakeInternalKernel("R");
    store.runningKernels = [one, two];

    provider.shutdownAllKernels();

    expect(one.shutDown).toBe(true);
    expect(one.destroyed).toBe(true);
    expect(two.destroyed).toBe(true);
  });
});

describe("introspection through the plugin API", () => {
  const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

  // The transports settle their own requests when a kernel goes away, but two
  // cases are past their reach: a websocket connection that drops without
  // JupyterLab disposing its futures, and a plugin middleware that never calls
  // the callback it was handed. Left unbounded, either leaves the promise
  // pending for the life of the window — and the MCP inspect tool awaits it.
  function silentKernel() {
    return { complete() {}, inspect() {} };
  }

  /** Let the timer fire, then let the promise it settled be observed. */
  async function advanceTo(ms) {
    window.advanceClock(ms);
    await Promise.resolve();
  }

  it("resolves a completion that is never answered", async () => {
    const kernel = new JupyterKernel(silentKernel());
    const pending = kernel.complete("np.a", { timeoutMs: 50 });

    await advanceTo(50);

    await expectAsync(pending).toBeResolvedTo({ status: "timeout", matches: [] });
  });

  it("resolves an inspection that is never answered", async () => {
    const kernel = new JupyterKernel(silentKernel());
    const pending = kernel.inspect("np.array", 8, { timeoutMs: 50 });

    await advanceTo(50);

    await expectAsync(pending).toBeResolvedTo({ status: "timeout", data: {}, found: false });
  });

  it("defaults to a timeout even when none is asked for", async () => {
    const kernel = new JupyterKernel(silentKernel());
    const pending = kernel.complete("np.a");

    await advanceTo(JupyterKernel.INTROSPECT_TIMEOUT_MS);

    await expectAsync(pending).toBeResolvedTo({ status: "timeout", matches: [] });
  });

  it("hands back the kernel's own answer when it arrives first", async () => {
    const kernel = new JupyterKernel({
      complete: (code, callback) => callback({ matches: ["np.array"] }),
    });

    await expectAsync(kernel.complete("np.a")).toBeResolvedTo({ matches: ["np.array"] });
  });

  it("ignores an answer that arrives after the timeout", async () => {
    let answer = null;
    const kernel = new JupyterKernel({
      complete: (code, callback) => {
        answer = callback;
      },
    });
    const pending = kernel.complete("np.a", { timeoutMs: 50 });

    await advanceTo(50);
    answer({ matches: ["too late"] });

    await expectAsync(pending).toBeResolvedTo({ status: "timeout", matches: [] });
  });

  it("waits indefinitely when the timeout is turned off", async () => {
    // `execute`'s default, for a caller that knows what it is waiting for.
    let settled = false;
    const kernel = new JupyterKernel(silentKernel());

    kernel.complete("np.a", { timeoutMs: 0 }).then(() => {
      settled = true;
    });
    await advanceTo(JupyterKernel.INTROSPECT_TIMEOUT_MS * 10);

    expect(settled).toBe(false);
  });
});
