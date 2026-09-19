const path = require("path");

const PACKAGE_NAME = "jupyter-repl";
const PACKAGE_PATH = path.join(__dirname, "..");
const RUNTIME_HOOK = "jupyter-repl:runtime-needed";

describe("deferred jupyter-repl activation", () => {
  let activation, pack, previousDebug, previousDeferredHooks, previousInitialPackagesLoaded;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    if (lumine.packages.isPackageActive(PACKAGE_NAME)) {
      await lumine.packages.deactivatePackage(PACKAGE_NAME);
    }
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    lumine.packages.triggeredActivationHooks.delete(RUNTIME_HOOK);
    // Package specs do not run the application's initial package phase. Put
    // this manager in the post-startup state whose lazy hooks and service
    // demands this behavior is about, then restore the harness afterwards.
    previousDeferredHooks = lumine.packages.deferredActivationHooks;
    previousInitialPackagesLoaded = lumine.packages.initialPackagesLoaded;
    lumine.packages.deferredActivationHooks = null;
    lumine.packages.initialPackagesLoaded = true;
    previousDebug = lumine.config.get("jupyter-repl.debug");

    activation = lumine.packages.activatePackage(PACKAGE_PATH, { defer: true });
    pack = lumine.packages.getLoadedPackage(PACKAGE_NAME);
  });

  afterEach(async () => {
    if (!pack.mainActivated) {
      pack.activateNow();
    }
    await activation;
    if (lumine.packages.isPackageActive(PACKAGE_NAME)) {
      await lumine.packages.deactivatePackage(PACKAGE_NAME);
    }
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    lumine.packages.triggeredActivationHooks.delete(RUNTIME_HOOK);
    lumine.packages.deferredActivationHooks = previousDeferredHooks;
    lumine.packages.initialPackagesLoaded = previousInitialPackagesLoaded;
    lumine.config.set("jupyter-repl.debug", previousDebug);
  });

  it("does not require or activate the main module while it waits", () => {
    expect(pack.mainModule).toBeNull();
    expect(pack.mainActivated).toBe(false);
  });

  it("activates in the same dispatch as one of its workspace commands", async () => {
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-repl:debug-toggle");
    await activation;

    expect(pack.mainActivated).toBe(true);
    expect(lumine.config.get("jupyter-repl.debug")).toBe(!previousDebug);
  });

  it("activates synchronously when another package requests the runtime", async () => {
    lumine.packages.triggerActivationHook(RUNTIME_HOOK);
    expect(pack.mainActivated).toBe(true);
    await activation;
  });

  it("activates synchronously when an advertised runtime service is consumed", async () => {
    let outputService = null;
    const subscription = lumine.packages.serviceHub.consume(
      "jupyter.output",
      "^1.0.0",
      (service) => {
        outputService = service;
      },
    );
    expect(pack.mainActivated).toBe(true);
    await activation;

    expect(pack.mainActivated).toBe(true);
    expect(outputService).toBeTruthy();
    subscription.dispose();
  });
});
