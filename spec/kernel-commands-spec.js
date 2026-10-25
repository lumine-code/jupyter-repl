const path = require("path");
let services = require("../lib/services");
let store = require("../lib/store");

const PACKAGE_PATH = path.join(__dirname, "..");
/* global conditionPromise */

describe("kernel commands picker command", () => {
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage(PACKAGE_PATH);
    services = require("../lib/services");
    store = require("../lib/store");
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("disables kernel controls without blocking kernel setup when no kernel is running", () => {
    const warning = spyOn(lumine.notifications, "addWarning");

    const result = lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:toggle-kernel-commands",
    );

    expect(result).toBeNull();
    expect(warning).not.toHaveBeenCalled();
    const target = lumine.workspace.getElement();
    for (const command of [
      "interrupt-kernel",
      "restart-kernel",
      "shutdown-kernel",
      "rename-remote-session",
      "copy-console-command",
    ])
      expect(lumine.commands.canDispatch(target, `jupyter-repl:${command}`)).toBe(false);
    expect(lumine.commands.canDispatch(target, "jupyter-repl:start-local-kernel")).toBe(true);
  });

  it("opens the same kernel command picker used by the status bar", async () => {
    const kernel = { destroy: jasmine.createSpy("destroy") };
    store.runningKernels = [kernel];
    const item = {
      getTitle: () => "Kernel client",
      getJupyterKernel: () => kernel,
      canCopy: () => false,
      element: document.createElement("div"),
    };
    await lumine.workspace.open(item);
    store.updateActivePaneItem(item);
    const showKernelCommands = spyOn(services.consumed.statusBar, "showKernelCommands");

    lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:toggle-kernel-commands",
    );

    expect(showKernelCommands).toHaveBeenCalled();
    const [commandStore, handleKernelCommand] = showKernelCommands.calls.mostRecent().args;
    expect(commandStore.kernel).toBe(kernel);
    expect(typeof handleKernelCommand).toBe("function");
  });

  it("does not attach another console to a quarantined kernel", async () => {
    const kernel = {
      executionState: "busy",
      transport: { lifecycle: "recovering", connectionFile: "kernel.json" },
      destroy: jasmine.createSpy("destroy"),
    };
    store.runningKernels = [kernel];
    const item = {
      getJupyterKernel: () => kernel,
      getTitle: () => "Kernel Client",
      element: document.createElement("div"),
    };
    await lumine.workspace.open(item);
    store.updateActivePaneItem(item);
    const launcher = require("../lib/launch-jupyter");
    const open = spyOn(launcher, "openJupyterConsole");
    const warning = spyOn(lumine.notifications, "addWarning");

    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-repl:open-terminal");

    expect(open).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
    expect(
      lumine.commands.canDispatch(lumine.workspace.getElement(), "jupyter-repl:open-terminal"),
    ).toBe(false);
    expect(
      lumine.commands.canDispatch(lumine.workspace.getElement(), "jupyter-repl:restart-kernel"),
    ).toBe(true);
    kernel.transport.lifecycle = "ready";
    expect(
      lumine.commands.canDispatch(lumine.workspace.getElement(), "jupyter-repl:open-terminal"),
    ).toBe(true);
  });

  it("waits for the terminal service before completing the first open command", async () => {
    const kernel = {
      executionState: "idle",
      transport: { lifecycle: "ready", connectionFile: "kernel.json" },
      destroy: jasmine.createSpy("destroy"),
    };
    store.runningKernels = [kernel];
    const item = {
      getJupyterKernel: () => kernel,
      getTitle: () => "Kernel Client",
      element: document.createElement("div"),
    };
    await lumine.workspace.open(item);
    store.updateActivePaneItem(item);
    const mainModule = lumine.packages.getLoadedPackage("jupyter-repl").mainModule;
    const terminalService = {};
    let deliverService;
    let delivery;
    const serviceReady = new Promise((resolve) => {
      deliverService = resolve;
    });
    const request = spyOn(lumine.packages, "requestService").and.callFake(async () => {
      await serviceReady;
      delivery = mainModule.consumeTerminal(terminalService);
      return true;
    });
    const launcher = require("../lib/launch-jupyter");
    const open = spyOn(launcher, "openJupyterConsole").and.resolveTo();

    const dispatched = lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:open-terminal",
    );
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith("terminal", "^1.0.0");
    expect(open).not.toHaveBeenCalled();
    const otherKernel = { executionState: "idle", destroy() {} };
    store.runningKernels = [kernel, otherKernel];
    await lumine.workspace.open({
      getJupyterKernel: () => otherKernel,
      getTitle: () => "Other Kernel Client",
      element: document.createElement("div"),
    });
    deliverService();
    await dispatched;

    expect(open.calls.mostRecent().args[0]).toBe(terminalService);
    expect(open.calls.mostRecent().args[1].kernel).toBe(kernel);
    delivery.dispose();
  });

  for (const [command, method] of [
    ["restart-kernel", "restart"],
    ["shutdown-kernel", "shutdownAndDestroy"],
    ["disconnect-kernel", "disconnect"],
  ]) {
    it(`keeps the picker callback pending until ${command} finishes`, async () => {
      let finish;
      const operation = jasmine
        .createSpy(method)
        .and.returnValue(new Promise((resolve) => (finish = resolve)));
      const session = { capabilities: { disconnect: true }, disconnect: operation };
      const kernel = {
        executionState: "idle",
        transport: { lifecycle: "ready" },
        [method]: operation,
        getPluginWrapper: () => session,
        destroy() {},
      };
      store.runningKernels = [kernel];
      await lumine.workspace.open({
        getJupyterKernel: () => kernel,
        getTitle: () => "Kernel Client",
        element: document.createElement("div"),
      });
      const show = spyOn(services.consumed.statusBar, "showKernelCommands");
      await lumine.commands.dispatch(
        lumine.workspace.getElement(),
        "jupyter-repl:toggle-kernel-commands",
      );
      const [context, handle] = show.calls.mostRecent().args;
      let settled = false;
      const pending = handle({ command }, context).then((result) => {
        settled = true;
        return result;
      });
      await conditionPromise(() => operation.calls.count() === 1);
      expect(settled).toBe(false);
      finish("completed");
      expect(await pending).toBe("completed");
    });
  }
});
