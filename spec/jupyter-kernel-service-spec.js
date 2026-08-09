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
    spyOn(store, "getFilesForKernel").andReturn(["/tmp/a.py"]);

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
