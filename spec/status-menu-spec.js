describe("kernel status action menu", () => {
  let consumer, lease, element, store;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    lumine.workspace.getElement().focus();
    const pack = await lumine.packages.activatePackage("jupyter-repl");
    const requireCurrent = require("node:module").createRequire(
      require("node:path").join(pack.path, "package.json"),
    );
    const { StatusBarConsumer } = requireCurrent("./lib/services/consumed/status-bar/status-bar");
    consumer = new StatusBarConsumer();
    store = {
      kernel: {
        displayName: "Test",
        executionState: "idle",
        onDidChangeStatus: () => ({ dispose() {} }),
      },
      subscriptions: { add() {}, remove() {} },
      onDidChangeCurrentKernel: () => ({ dispose() {} }),
    };
    lease = consumer.addStatusBar(store, {
      addLeftTile({ item }) {
        element = item;
        lumine.workspace.getElement().appendChild(item);
        return { destroy: () => item.remove() };
      },
    });
  });
  afterEach(async () => {
    lease.dispose();
    consumer.dispose();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  it("offers only the command picker with its shortcut", () => {
    const items = lumine.contextMenu.templateForElement(element);
    const keys = process.platform === "darwin" ? "⌥J K M" : "Alt+J K M";
    expect(items.map((item) => item.command)).toEqual(["jupyter-repl:toggle-kernel-commands"]);
    expect(items[0].keyBindingLabel).toBe(keys);
    const popup = lumine.contextMenu.show(element, items);
    try {
      expect(popup.rootList.items[0].keystrokeElement.textContent).toBe(keys);
    } finally {
      popup.close();
    }
  });
  it("keeps recovery actions inside the picker", () => {
    store.kernel.transport = { lifecycle: "recovering" };
    expect(lumine.contextMenu.templateForElement(element).map((item) => item.command)).toEqual([
      "jupyter-repl:toggle-kernel-commands",
    ]);
  });
  it("keeps right click inert, exposes middle interrupt and removes its menu", () => {
    const dispatch = spyOn(lumine.commands, "dispatch");
    element.dispatchEvent(new MouseEvent("click", { button: 2 }));
    expect(dispatch).not.toHaveBeenCalled();
    element.dispatchEvent(new MouseEvent("auxclick", { button: 1 }));
    expect(dispatch.calls.mostRecent().args[1]).toBe("jupyter-repl:run-kernel-command");
    expect(dispatch.calls.mostRecent().args[2].command).toBe("interrupt-kernel");
    lease.dispose();
    expect(lumine.contextMenu.templateForElement(element)).toEqual([]);
  });
});

describe("kernel menu execution context", () => {
  let store;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.attachToDOM(lumine.workspace.getElement());
    const pack = await lumine.packages.activatePackage("jupyter-repl");
    const requireCurrent = require("node:module").createRequire(
      require("node:path").join(pack.path, "package.json"),
    );
    store = requireCurrent("./lib/store");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  it("acts on the window's captured kernel instead of the shared session selection", async () => {
    const first = {
      interrupt: jasmine.createSpy("first interrupt"),
      destroy() {},
      executionState: "idle",
    };
    const second = {
      interrupt: jasmine.createSpy("second interrupt"),
      destroy() {},
      executionState: "idle",
    };
    store.runningKernels = [first, second];
    const item = (kernel) => ({
      getTitle: () => "Kernel Client",
      getJupyterKernel: () => kernel,
      canCopy: () => false,
      element: document.createElement("div"),
    });
    await lumine.workspace.open(item(first));
    store.updateActivePaneItem(item(second));
    const detail = { command: "interrupt-kernel", kernelContext: { kernel: first } };
    await lumine.commands.dispatch(
      lumine.workspace.getElement(),
      "jupyter-repl:run-kernel-command",
      detail,
    );
    expect(first.interrupt).toHaveBeenCalledTimes(1);
    expect(second.interrupt).not.toHaveBeenCalled();
    await lumine.workspace.open(item(second));
    const warning = spyOn(lumine.notifications, "addWarning");
    await lumine.commands.dispatch(
      lumine.workspace.getElement(),
      "jupyter-repl:run-kernel-command",
      detail,
    );
    expect(first.interrupt).toHaveBeenCalledTimes(1);
    expect(second.interrupt).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
  });
});
