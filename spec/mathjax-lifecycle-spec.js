const path = require("node:path");
const { createRequire } = require("node:module");
const { CompositeDisposable, Disposable, Emitter } = require("lumine");

const PACKAGE_NAME = "jupyter-repl";
const PACKAGE_PATH = path.resolve(__dirname, "..");
// A physical parent follows the package's current module generation even when
// this spec remains loaded across a package unload/reload.
const requirePackage = createRequire(path.join(PACKAGE_PATH, "package.json"));

describe("MathJax kernel warm-up", () => {
  let store, events, warmMathJax, disposeMathJax, current, destroyWindow;

  beforeEach(() => {
    events = new Emitter();
    store = {
      subscriptions: new CompositeDisposable(),
      runningKernels: [],
      onDidAddKernel: (callback) => events.on("kernel", callback),
    };
    current = true;
    warmMathJax = jasmine.createSpy("warmMathJax").and.returnValue(Promise.resolve());
    disposeMathJax = jasmine.createSpy("disposeMathJax");
    spyOn(lumine.window, "onWillDestroy").and.callFake((callback) => {
      destroyWindow = callback;
      return new Disposable();
    });
  });

  afterEach(() => {
    store.subscriptions.dispose();
    events.dispose();
  });

  function observe() {
    requirePackage("./lib/workspace-observers").observeRuntime({
      store,
      isCurrent: () => current,
      disposeMcp() {},
      getKernelManager: () => null,
      warmMathJax,
      disposeMathJax,
    });
  }

  it("leaves MathJax cold while no kernel is running", async () => {
    observe();
    await Promise.resolve();
    expect(warmMathJax).not.toHaveBeenCalled();
  });

  it("prepares one worker for all kernels after the registration event", async () => {
    observe();
    events.emit("kernel", {});
    events.emit("kernel", {});
    expect(warmMathJax).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(warmMathJax).toHaveBeenCalledTimes(1);
  });

  it("also prepares MathJax for a kernel registered before runtime observers", async () => {
    store.runningKernels.push({});
    observe();
    await Promise.resolve();
    events.emit("kernel", {});
    await Promise.resolve();
    expect(warmMathJax).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed speculative warm-up out of user notifications", async () => {
    warmMathJax.and.callFake(() => Promise.reject(new Error("Worker failed")));
    spyOn(lumine.notifications, "addError");
    spyOn(lumine.notifications, "addWarning");
    observe();
    events.emit("kernel", {});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(warmMathJax).toHaveBeenCalledTimes(1);
    expect(lumine.notifications.addError).not.toHaveBeenCalled();
    expect(lumine.notifications.addWarning).not.toHaveBeenCalled();
  });

  it("does not start a queued worker after the package generation changes", async () => {
    observe();
    events.emit("kernel", {});
    current = false;
    await Promise.resolve();
    expect(warmMathJax).not.toHaveBeenCalled();
  });

  it("disposes the worker and cancels pending warm-up when the window is destroyed", async () => {
    observe();
    events.emit("kernel", {});
    destroyWindow();
    expect(disposeMathJax).toHaveBeenCalledTimes(1);
    // Renderer teardown gives the store a fresh subscriptions container. The
    // queued warm-up must still observe the disposed runtime it came from.
    expect(store.subscriptions.disposed).toBe(false);
    await Promise.resolve();
    expect(warmMathJax).not.toHaveBeenCalled();
    events.emit("kernel", {});
    await Promise.resolve();
    expect(warmMathJax).not.toHaveBeenCalled();
  });
});

describe("MathJax package lifetime", () => {
  let pack, store, workerConstruction;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    workerConstruction = spyOn(window, "Worker").and.callThrough();
    pack = await lumine.packages.startPackage(PACKAGE_PATH);
    store = requirePackage("./lib/store");
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
  });

  it("does not create a worker when activated without a kernel", () => {
    expect(pack.mainActivated).toBe(true);
    expect(workerConstruction).not.toHaveBeenCalled();
  });

  it("warms the current client on kernel registration and disposes it on deactivation", async () => {
    const client = requirePackage("./lib/mathjax-client");
    spyOn(client, "warmMathJax").and.returnValue(Promise.resolve());
    spyOn(client, "disposeMathJax");
    store.emitter.emit("did-add-kernel", {});
    await Promise.resolve();
    expect(client.warmMathJax).toHaveBeenCalledTimes(1);
    await lumine.packages.deactivatePackage(PACKAGE_NAME);
    expect(client.disposeMathJax).toHaveBeenCalled();
  });

  it("disposes a client first used by kernel-free output", async () => {
    const client = requirePackage("./lib/mathjax-client");
    spyOn(client, "disposeMathJax");
    expect(store.runningKernels.length).toBe(0);
    await lumine.packages.deactivatePackage(PACKAGE_NAME);
    expect(client.disposeMathJax).toHaveBeenCalled();
  });

  it("does not retain the old warm-up observer across package generations", async () => {
    const oldStore = store;
    const oldClient = requirePackage("./lib/mathjax-client");
    spyOn(oldClient, "warmMathJax").and.returnValue(Promise.resolve());
    await lumine.packages.unloadPackage(PACKAGE_NAME);
    pack = await lumine.packages.startPackage(PACKAGE_PATH);
    store = requirePackage("./lib/store");
    const client = requirePackage("./lib/mathjax-client");
    spyOn(client, "warmMathJax").and.returnValue(Promise.resolve());
    oldStore.emitter.emit("did-add-kernel", {});
    await Promise.resolve();
    expect(oldClient.warmMathJax).not.toHaveBeenCalled();
    expect(client.warmMathJax).not.toHaveBeenCalled();
    store.emitter.emit("did-add-kernel", {});
    await Promise.resolve();
    expect(client.warmMathJax).toHaveBeenCalledTimes(1);
  });
});
