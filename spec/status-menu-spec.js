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
  it("shows the owned public signal shortcuts while retaining captured menu execution", () => {
    const items = lumine.contextMenu.templateForElement(element);
    const keys = (letter) =>
      process.platform === "darwin" ? `⌥J K ${letter}` : `Alt+J K ${letter}`;
    expect(
      items.find((item) => item.command === "jupyter-repl:toggle-kernel-commands").keyBindingLabel,
    ).toBe(keys("M"));
    for (const [command, letter] of [
      ["interrupt-kernel", "I"],
      ["restart-kernel", "R"],
      ["shutdown-kernel", "S"],
    ]) {
      const item = items.find((item) => item.commandDetail?.command === command);
      expect(item.command).toBe("jupyter-repl:run-kernel-command");
      expect(item.commandDetail.kernelContext.kernel).toBe(store.kernel);
      expect(item.keyBindingLabel).toBe(keys(letter));
    }
    expect(
      items.find((item) => item.commandDetail?.command === "copy-console-command").keyBindingLabel,
    ).toBeUndefined();
    const popup = lumine.contextMenu.show(element, items);
    try {
      expect(
        popup.rootList.items.find(
          (item) => item.template.commandDetail?.command === "interrupt-kernel",
        ).keystrokeElement.textContent,
      ).toBe(keys("I"));
    } finally {
      popup.close();
    }
  });
  it("shares availability with the picker and captures the kernel in menu actions", () => {
    const menu = () => lumine.contextMenu.templateForElement(element);
    expect(menu().some((item) => item.command === "jupyter-repl:toggle-kernel-commands")).toBe(
      true,
    );
    const actions = menu().filter((item) => item.commandDetail);
    expect(actions.map((item) => item.commandDetail.command)).toContain("interrupt-kernel");
    expect(actions[0].commandDetail.kernelContext.kernel).toBe(store.kernel);
    store.kernel.transport = { lifecycle: "recovering" };
    expect(
      menu()
        .filter((item) => item.commandDetail)
        .map((item) => item.commandDetail.command),
    ).toEqual(["restart-kernel", "shutdown-kernel"]);
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
