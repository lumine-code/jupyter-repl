const SignalListView = require("../lib/services/consumed/status-bar/signal-list-view");

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
    await view.selectList.show();

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
    expect(view.selectList.isVisible()).toBe(false);
  });
});
