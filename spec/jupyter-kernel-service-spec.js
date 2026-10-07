const { Emitter, CompositeDisposable } = require("lumine");
let JupyterProvider, store;

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
    // As the real Kernel does: ask, wait, then tear down regardless.
    async shutdownAndDestroy() {
      this.shutdown();
      this.destroy();
    },
  };
}

describe("real JupyterKernel wrapper teardown", () => {
  const JupyterKernel = require("../lib/plugin-api/jupyter-kernel");

  // The monitor's shutdown button goes through the wrapper. Shutdown that
  // only sent the request left the dead kernel registered: still listed,
  // and with files still mapped to it, so the next run executed into the
  // corpse instead of starting a fresh kernel.
  it("shutdown releases the kernel, not just the process", async () => {
    const internal = {
      shutDown: false,
      destroyed: false,
      shutdown() {
        this.shutDown = true;
      },
      destroy() {
        this.destroyed = true;
      },
      async shutdownAndDestroy() {
        this.shutdown();
        this.destroy();
      },
    };
    const wrapper = new JupyterKernel(internal);

    await wrapper.shutdown();

    expect(internal.shutDown).toBe(true);
    expect(internal.destroyed).toBe(true);
  });

  it("names the kernel by the id the window gave it", () => {
    // displayName is the kernelspec's, so two Python 3 kernels share it, and
    // getConnectionFile() throws for one reached over a websocket.
    expect(new JupyterKernel({ id: "kernel-3" }).id).toBe("kernel-3");
  });

  it("returns a disposable destruction subscription", () => {
    const emitter = new Emitter();
    const wrapper = new JupyterKernel({ emitter });
    const destroyed = jasmine.createSpy("destroyed");
    const subscription = wrapper.onDidDestroy(destroyed);
    const composite = new CompositeDisposable();

    expect(() => composite.add(subscription)).not.toThrow();
    emitter.emit("did-destroy");
    expect(destroyed).toHaveBeenCalled();

    composite.dispose();
    emitter.dispose();
  });
});

// Everything from iopub reaches the callback already in notebook format, and
// the kernel's own control messages are the ones carrying `stream`. Collecting
// on `result.data` — as this did — kept only execute_result and display_data:
// a stream output holds its content in `text` and an error output in
// ename/evalue/traceback, so everything printed and every traceback went
// missing, while the execution_count control message was pushed as output.
describe("Jupyter session execution requests", () => {
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
    const request = wrapper.request({ type: "execute", purpose: "user", code: "print('hello')" });
    const answer = request.done;
    await Promise.resolve();
    emit({ data: 1, stream: "execution_count" });
    emit(STREAM);
    emit({ data: "ok", stream: "status" });
    emit({ output_type: "status", execution_state: "idle" });

    const { status, outputs, executionCount } = await answer;
    expect(status).toBe("ok");
    expect(outputs).toEqual([STREAM]);
    expect(executionCount).toBe(1);
  });

  it("keeps a rich result alongside a stream", async () => {
    const request = wrapper.request({
      type: "execute",
      purpose: "user",
      code: "print('hello'); 42",
    });
    const answer = request.done;
    await Promise.resolve();
    emit(STREAM);
    emit(RESULT);
    emit({ data: "ok", stream: "status" });
    emit({ output_type: "status", execution_state: "idle" });

    expect((await answer).outputs).toEqual([STREAM, RESULT]);
  });

  it("keeps the traceback, and reports the error on its own", async () => {
    const request = wrapper.request({
      type: "execute",
      purpose: "user",
      code: "raise ValueError('no')",
    });
    const answer = request.done;
    await Promise.resolve();
    emit(ERROR);
    emit({ data: "error", stream: "status" });
    emit({ output_type: "status", execution_state: "idle" });

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
    const request = wrapper.request({ type: "execute", purpose: "user", code: "1" });
    const answer = request.done;
    await Promise.resolve();
    emit({ data: 7, stream: "execution_count" });
    emit({ data: "ok", stream: "status" });
    emit({ output_type: "status", execution_state: "idle" });

    const { outputs, executionCount } = await answer;
    expect(outputs).toEqual([]);
    expect(executionCount).toBe(7);
  });

  it("collects late IOPub output when the shell reply arrives first", async () => {
    let settled = false;
    const request = wrapper.request({
      type: "execute",
      purpose: "user",
      code: "print('hello'); 42",
    });
    const answer = request.done;
    await Promise.resolve();
    answer.then(() => {
      settled = true;
    });
    emit({ data: "ok", stream: "status" });
    await Promise.resolve();
    expect(settled).toBe(false);

    emit({ data: 8, stream: "execution_count" });
    emit(STREAM);
    emit(RESULT);
    emit({ output_type: "status", execution_state: "idle" });

    const result = await answer;
    expect(result.status).toBe("ok");
    expect(result.outputs).toEqual([STREAM, RESULT]);
    expect(result.executionCount).toBe(8);
  });

  it("keeps an error that arrives after its shell reply", async () => {
    const request = wrapper.request({
      type: "execute",
      purpose: "user",
      code: "raise ValueError('no')",
    });
    const answer = request.done;
    await Promise.resolve();
    emit({ data: "error", stream: "status" });
    emit(ERROR);
    emit({ output_type: "status", execution_state: "idle" });

    expect((await answer).error.ename).toBe("ValueError");
    expect((await answer).outputs).toEqual([ERROR]);
  });

  it("also settles when the IOPub idle arrives before the reply", async () => {
    const request = wrapper.request({ type: "execute", purpose: "user", code: "1" });
    const answer = request.done;
    await Promise.resolve();
    emit(RESULT);
    emit({ output_type: "status", execution_state: "idle" });
    emit({ data: "ok", stream: "status" });

    expect((await answer).outputs).toEqual([RESULT]);
  });

  it("releases its timeout when sending throws synchronously", async () => {
    spyOn(internal, "execute").and.throwError("middleware failed");
    spyOn(window, "clearTimeout").and.callThrough();

    const request = wrapper.request({
      type: "execute",
      purpose: "user",
      code: "1",
      timeoutMs: 5000,
    });
    const result = await request.done;
    expect(result.status).toBe("error");
    expect(result.error.evalue).toBe("middleware failed");

    expect(window.clearTimeout).toHaveBeenCalled();
  });

  describe("when the kernel never replies", () => {
    beforeEach(() => jasmine.useRealClock());

    // Without a timeout the promise stays pending for the life of the window,
    // which is what `while True:` in a cell used to do to every caller.
    it("gives up, keeping whatever arrived", async () => {
      const request = wrapper.request({
        type: "execute",
        purpose: "user",
        code: "while True: pass",
        timeoutMs: 20,
      });
      const answer = request.done;
      await Promise.resolve();
      emit(STREAM);

      const { status, outputs } = await answer;
      expect(status).toBe("timeout");
      expect(outputs).toEqual([STREAM]);
    });

    it("does not give up on a kernel that answers in time", async () => {
      const request = wrapper.request({
        type: "execute",
        purpose: "user",
        code: "1",
        timeoutMs: 5000,
      });
      const answer = request.done;
      await Promise.resolve();
      emit({ data: "ok", stream: "status" });
      emit({ output_type: "status", execution_state: "idle" });

      expect((await answer).status).toBe("ok");
    });

    // The execution runs on after the timeout — that is what a timeout means
    // here — but nothing will read this array again. The runaway loop a
    // timeout exists for would fill it until the kernel was restarted.
    it("stops collecting output once it has given up", async () => {
      const request = wrapper.request({
        type: "execute",
        purpose: "user",
        code: "while True: print(1)",
        timeoutMs: 20,
      });
      const answer = request.done;
      await Promise.resolve();
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
      const request = wrapper.request({
        type: "execute",
        purpose: "user",
        code: "slow()",
        timeoutMs: 20,
      });
      const answer = request.done;
      await Promise.resolve();
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
    JupyterProvider = require("../lib/plugin-api/jupyter-provider");
    store = require("../lib/store");
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

  it("shuts every kernel down when asked", async () => {
    const one = fakeInternalKernel("Python 3");
    const two = fakeInternalKernel("R");
    store.runningKernels = [one, two];

    provider.shutdownAllKernels();
    await Promise.resolve();

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
  // pending for the life of the window — and service consumers await it.
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
    const pending = kernel.request({
      type: "complete",
      purpose: "query",
      code: "np.a",
      timeoutMs: 50,
    }).done;
    await Promise.resolve();

    await advanceTo(50);

    expect((await pending).status).toBe("timeout");
    expect((await pending).data).toEqual({ matches: [] });
  });

  it("resolves an inspection that is never answered", async () => {
    const kernel = new JupyterKernel(silentKernel());
    const pending = kernel.request({
      type: "inspect",
      purpose: "query",
      code: "np.array",
      cursorPos: 8,
      timeoutMs: 50,
    }).done;
    await Promise.resolve();

    await advanceTo(50);

    expect((await pending).status).toBe("timeout");
    expect((await pending).data).toEqual({ data: {}, found: false });
  });

  it("defaults to a timeout even when none is asked for", async () => {
    const kernel = new JupyterKernel(silentKernel());
    const pending = kernel.request({ type: "complete", purpose: "query", code: "np.a" }).done;
    await Promise.resolve();

    await advanceTo(JupyterKernel.INTROSPECT_TIMEOUT_MS);

    expect((await pending).status).toBe("timeout");
    expect((await pending).data).toEqual({ matches: [] });
  });

  it("hands back the kernel's own answer when it arrives first", async () => {
    const kernel = new JupyterKernel({
      complete: (code, callback) => callback({ matches: ["np.array"] }),
    });

    const result = await kernel.request({ type: "complete", purpose: "query", code: "np.a" }).done;
    expect(result.status).toBe("ok");
    expect(result.data).toEqual({ matches: ["np.array"] });
  });

  it("ignores an answer that arrives after the timeout", async () => {
    let answer = null;
    const kernel = new JupyterKernel({
      complete: (code, callback) => {
        answer = callback;
      },
    });
    const pending = kernel.request({
      type: "complete",
      purpose: "query",
      code: "np.a",
      timeoutMs: 50,
    }).done;
    await Promise.resolve();

    await advanceTo(50);
    answer({ matches: ["too late"] });

    expect((await pending).status).toBe("timeout");
    expect((await pending).data).toEqual({ matches: [] });
  });

  it("waits indefinitely when the timeout is turned off", async () => {
    // `execute`'s default, for a caller that knows what it is waiting for.
    let settled = false;
    const kernel = new JupyterKernel(silentKernel());

    kernel
      .request({ type: "complete", purpose: "query", code: "np.a", timeoutMs: 0 })
      .done.then(() => {
        settled = true;
      });
    await advanceTo(JupyterKernel.INTROSPECT_TIMEOUT_MS * 10);

    expect(settled).toBe(false);
  });
});
