const SignalListView = require("../lib/services/consumed/status-bar/signal-list-view");
/* global conditionPromise */

describe("SignalListView", () => {
  let handler, store, view;

  beforeEach(() => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    handler = jasmine.createSpy("handleKernelCommand");
    store = { kernel: { transport: {} } };
    view = new SignalListView(store, handler);
  });

  afterEach(() => {
    view.destroy();
  });

  it("loads a stable snapshot and runs its explicit primary action", async () => {
    await view.selectListHost.show();

    expect(view.selectList.getItems().map((item) => item.command)).toEqual([
      "interrupt-kernel",
      "restart-kernel",
      "shutdown-kernel",
      "open-jupyter-console",
      "spawn-jupyter-console",
    ]);

    await view.selectList.selectItemById("restart-kernel");
    await view.selectList.confirmSelection();

    expect(handler).toHaveBeenCalledTimes(1);
    const [item, receivedStore] = handler.calls.mostRecent().args;
    expect(item.command).toBe("restart-kernel");
    expect(receivedStore).toBe(store);
    expect(view.selectListHost.isVisible()).toBe(false);
  });

  for (const executionState of ["recovering", "unresponsive"]) {
    it(`only offers recovery commands while the kernel is ${executionState}`, async () => {
      store.kernel.executionState = executionState;

      await view.selectListHost.show();

      expect(view.selectList.getItems().map((item) => item.command)).toEqual([
        "restart-kernel",
        "shutdown-kernel",
      ]);
    });
  }

  it("runs repeated kernel actions in keep-open mode", async () => {
    await view.selectListHost.show();
    await view.selectList.runAction("select-list:toggle-keep-open");

    for (const command of ["interrupt-kernel", "restart-kernel"]) {
      await view.selectList.selectItemById(command);
      await view.selectList.confirmSelection();
      expect(handler.calls.mostRecent().args[0].command).toBe(command);
      expect(view.selectListHost.isVisible()).toBe(true);
    }
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("waits for a command once and refreshes lifecycle choices without losing its query", async () => {
    let finish;
    handler.and.returnValue(new Promise((resolve) => (finish = resolve)));
    await view.selectListHost.show();
    const list = view.selectList;
    await list.runAction("select-list:toggle-keep-open");
    await list.setQuery("kernel");
    await list.selectItemById("restart-kernel");
    const first = list.confirmSelection();
    const second = list.confirmSelection();
    await conditionPromise(() => handler.calls.count() === 1);
    expect(list.isActionPending()).toBe(true);
    store.kernel.transport.lifecycle = "recovering";
    finish();
    await Promise.all([first, second]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(list.getQuery()).toBe("kernel");
    expect(list.getSelectedItem().command).toBe("restart-kernel");
    expect(list.getItems().map((item) => item.command)).toEqual([
      "restart-kernel",
      "shutdown-kernel",
    ]);
    expect(view.selectListHost.isVisible()).toBe(true);
  });

  it("leaves a newer session alone when an older command finishes", async () => {
    let finish;
    handler.and.returnValue(new Promise((resolve) => (finish = resolve)));
    await view.selectListHost.show();
    const list = view.selectList;
    await list.runAction("select-list:toggle-keep-open");
    const pending = list.confirmSelection();
    await conditionPromise(() => handler.calls.count() === 1);
    view.selectListHost.hide();
    store.kernel.transport.lifecycle = "recovering";
    await view.selectListHost.show();
    await list.setQuery("restart");
    const publish = spyOn(list, "setItems").and.callThrough();
    finish();
    await pending;

    expect(publish).not.toHaveBeenCalled();
    expect(list.getQuery()).toBe("restart");
    expect(view.selectListHost.isVisible()).toBe(true);
  });

  it("reports asynchronous command failures through the retained list", async () => {
    const error = new Error("Kernel command failed");
    handler.and.rejectWith(error);
    await view.selectListHost.show();
    await view.selectList.runAction("select-list:toggle-keep-open");
    await expectAsync(view.selectList.confirmSelection()).toBeRejectedWith(error);
    expect(view.selectList.getStatus().message).toBe(error.message);
    expect(view.selectListHost.isVisible()).toBe(true);
  });

  it("removes commands after the selected kernel has shut down", async () => {
    handler.and.callFake(() => {
      store.kernel.transport.lifecycle = "dead";
    });
    await view.selectListHost.show();
    await view.selectList.runAction("select-list:toggle-keep-open");
    await view.selectList.selectItemById("shutdown-kernel");
    await view.selectList.confirmSelection();
    expect(view.selectList.getItems()).toEqual([]);
    expect(view.selectListHost.isVisible()).toBe(true);
  });

  it("disables commands that become unavailable after the opening snapshot", async () => {
    await view.selectListHost.show();
    const list = view.selectList;
    await list.selectItemById("interrupt-kernel");
    store.kernel.transport.lifecycle = "recovering";
    const command = "jupyter-repl:run-selected-kernel-command";
    expect(lumine.commands.canDispatch(list.getElement(), command, list.getActionContext())).toBe(
      false,
    );
    expect(lumine.commands.dispatch(list.getElement(), command)).toBeNull();
    expect(await view.runCommand(list.getSelectedItem())).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });
});
