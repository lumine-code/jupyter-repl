const path = require("path");
const services = require("../lib/services");
const store = require("../lib/store");

const PACKAGE_PATH = path.join(__dirname, "..");

describe("kernel commands picker command", () => {
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    await lumine.packages.activatePackage(PACKAGE_PATH);
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("warns when the current editor has no running kernel", () => {
    const warning = spyOn(lumine.notifications, "addWarning");

    lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:toggle-kernel-commands",
    );

    expect(warning).toHaveBeenCalledWith("No running kernel for the current editor");
  });

  it("opens the same kernel command picker used by the status bar", () => {
    const kernel = { destroy: jasmine.createSpy("destroy") };
    store.runningKernels = [kernel];
    store.updateActivePaneItem({ getJupyterKernel: () => kernel });
    const showKernelCommands = spyOn(services.consumed.statusBar, "showKernelCommands");

    lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:toggle-kernel-commands",
    );

    expect(showKernelCommands).toHaveBeenCalled();
    const [commandStore, handleKernelCommand] = showKernelCommands.calls.mostRecent().args;
    expect(commandStore).toBe(store);
    expect(typeof handleKernelCommand).toBe("function");
  });
});
