const path = require("path");
const { Disposable } = require("lumine");

// Activate by path, not by name: resolving the name would need this checkout
// linked into the packages directory, which is a property of whoever runs the
// suite rather than of the suite.
const PACKAGE_PATH = path.join(__dirname, "..");

// An orderly unload deactivates the package, which releases the kernels' zmq
// sockets. This is the net under one that never got there — a crashed renderer
// being reloaded. Left open, those sockets make zeromq run callbacks into an
// environment that is already tearing down, and libzmq aborts the renderer:
// the user sees "The editor has crashed" whenever they restart with a kernel
// still running.
describe("teardown with a running kernel", () => {
  let store;

  // Activation itself measures at 0 ms here, but jasmine's default budget for
  // an async beforeEach is shared with whatever the rest of the suite left
  // pending, and a full run can spend it before this even starts.
  beforeEach(async () => {
    store = require("../lib/store");
    // The package activates on its commands, so dispatch one to trigger it.
    const activation = lumine.packages.activatePackage(PACKAGE_PATH);
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-repl:debug-toggle");
    await activation;
  }, 30000);

  afterEach(async () => {
    store.runningKernels = [];
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  // `grammar` is what the package's editor-class autorun reads off a running
  // kernel; without it the store's own reaction throws before the assertion.
  function fakeKernel() {
    const kernel = { destroyed: 0, shutdowns: 0, grammar: { name: "Python" } };
    kernel.destroy = () => kernel.destroyed++;
    kernel.shutdown = () => kernel.shutdowns++;
    return kernel;
  }

  it("destroys running kernels when the window goes away", () => {
    const kernel = fakeKernel();
    store.runningKernels.push(kernel);

    lumine.emitter.emit("will-destroy");

    expect(kernel.destroyed).toBe(1);
  });

  // `destroy()` disconnects: for a WSKernel it disposes the client session and
  // leaves the kernel running on the server. `shutdown()` is the one that ends
  // the remote session, and closing a window must never do that — the kernel
  // outliving the editor is the whole point of running one remotely.
  it("disconnects from kernels without shutting them down", () => {
    const kernel = fakeKernel();
    store.runningKernels.push(kernel);

    lumine.emitter.emit("will-destroy");

    expect(kernel.destroyed).toBe(1);
    expect(kernel.shutdowns).toBe(0);
  });

  // Destroying a kernel changes the current one, and the status bar answers
  // that with `etch.update` — which renders on the next animation frame, after
  // core's `destroy()` has nulled `lumine.workspace`. Dropping the
  // subscriptions first is what keeps that update from ever being scheduled, so
  // the order is the assertion.
  it("disposes its subscriptions before destroying the kernels", () => {
    const order = [];
    store.subscriptions.add(new Disposable(() => order.push("subscriptions")));
    const kernel = fakeKernel();
    kernel.destroy = () => order.push("kernel");
    store.runningKernels.push(kernel);

    lumine.emitter.emit("will-destroy");

    expect(order).toEqual(["subscriptions", "kernel"]);
  });

  // `CompositeDisposable#add` is a silent no-op once disposed, and the store
  // outlives the window, so the handler has to leave a usable one behind.
  it("leaves a fresh CompositeDisposable behind", () => {
    lumine.emitter.emit("will-destroy");

    let disposed = false;
    store.subscriptions.add(new Disposable(() => (disposed = true)));
    store.subscriptions.dispose();

    expect(disposed).toBe(true);
  });

  it("destroys every kernel even when one throws", () => {
    const thrower = {
      grammar: { name: "Python" },
      destroy() {
        throw new Error("boom");
      },
    };
    const survivor = fakeKernel();
    store.runningKernels.push(thrower, survivor);
    spyOn(console, "error");

    lumine.emitter.emit("will-destroy");

    expect(survivor.destroyed).toBe(1);
  });
});
