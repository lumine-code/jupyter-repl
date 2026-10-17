let ExistingKernelPicker = require("../lib/existing-kernel-picker");
let adapterIntegration = require("../lib/adapter-integration");
let store = require("../lib/store");
/* global conditionPromise */

describe("existing kernel picker", () => {
  let picker;

  beforeEach(() => {
    ExistingKernelPicker = require("../lib/existing-kernel-picker");
    adapterIntegration = require("../lib/adapter-integration");
    store = require("../lib/store");
    store.runningKernels = [
      {
        id: "python",
        displayName: "Python 3",
        transport: {},
        kernelSpec: { name: "python3", language: "python" },
      },
      {
        id: "r",
        displayName: "R",
        transport: {},
        kernelSpec: { name: "ir", language: "R" },
      },
    ];
    spyOn(store, "getFilesForKernel").and.returnValue([]);
    picker = new ExistingKernelPicker();
  });

  afterEach(() => {
    picker.destroy();
    store.runningKernels = [];
  });

  async function flushPromises() {
    for (let index = 0; index < 10; index++) await Promise.resolve();
  }

  it("offers every running kernel to a notebook adapter", async () => {
    picker.toggle({ adapter: {}, grammar: { name: "Python", scopeName: "source.python" } });
    await flushPromises();

    expect(picker.selectList.getItems()).toEqual(store.runningKernels);
  });

  it("binds to the adapter context captured when the picker opened", () => {
    const context = { adapter: { name: "captured adapter" } };
    spyOn(adapterIntegration, "bindAdapterKernel").and.resolveTo(true);

    picker.toggle(context);
    picker.selectKernel(store.runningKernels[1]);

    expect(adapterIntegration.bindAdapterKernel).toHaveBeenCalledWith(
      context,
      store.runningKernels[1],
    );
  });

  it("does not bind an ordinary file whose captured editor was destroyed", () => {
    const editor = { isDestroyed: () => true, getPath: () => "C:\\work\\gone.py" };
    spyOn(store, "newKernel");

    picker.toggle({
      filePath: editor.getPath(),
      editor,
      grammar: { name: "Python", scopeName: "source.python" },
    });
    picker.selectKernel(store.runningKernels[0]);

    expect(store.newKernel).not.toHaveBeenCalled();
  });

  it("reuses the captured adapter for repeated selections until the picker closes", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const context = { adapter: { name: "captured adapter" } };
    spyOn(adapterIntegration, "bindAdapterKernel").and.resolveTo(true);
    await picker.toggle(context);
    await picker.selectList.runAction("select-list:toggle-keep-open");

    for (const kernel of store.runningKernels) {
      await picker.selectList.selectItem(kernel);
      await picker.selectList.confirmSelection();
      expect(adapterIntegration.bindAdapterKernel.calls.mostRecent().args).toEqual([
        context,
        kernel,
      ]);
      expect(picker.selectListHost.isVisible()).toBe(true);
    }

    picker.selectListHost.cancel();
    expect(picker._context).toBeNull();
  });

  it("removes retired kernel rows after binding and rejects their former identities", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const [retired, current] = store.runningKernels;
    const binding = spyOn(adapterIntegration, "bindAdapterKernel").and.callFake(async () => {
      store.runningKernels = [current];
      return true;
    });
    await picker.toggle({ adapter: {} });
    const list = picker.selectList;
    await list.runAction("select-list:toggle-keep-open");
    await list.setQuery("R");
    await list.selectItem(current);
    await list.confirmSelection();

    expect(list.getItems()).toEqual([current]);
    expect(list.getSelectedItem()).toBe(current);
    expect(list.getQuery()).toBe("R");
    expect(picker.selectListHost.isVisible()).toBe(true);
    expect(await picker.selectKernel(retired)).toBe(false);
    expect(binding).toHaveBeenCalledTimes(1);
  });

  it("does not publish an older binding into a reopened picker", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    let finish;
    const binding = spyOn(adapterIntegration, "bindAdapterKernel").and.returnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    const context = { adapter: {} };
    await picker.toggle(context);
    const list = picker.selectList;
    await list.runAction("select-list:toggle-keep-open");
    const pending = list.confirmSelection();
    await conditionPromise(() => binding.calls.count() === 1);
    picker.selectListHost.hide();
    await picker.toggle(context);
    const update = spyOn(list, "setItems").and.callThrough();
    finish(true);
    await pending;

    expect(update).not.toHaveBeenCalled();
    expect(picker.selectListHost.isVisible()).toBe(true);
  });

  it("disables a stale selected kernel before its obsolete row can dispatch", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const binding = spyOn(adapterIntegration, "bindAdapterKernel").and.resolveTo(true);
    await picker.toggle({ adapter: {} });
    const list = picker.selectList;
    const retired = list.getSelectedItem();
    store.runningKernels = store.runningKernels.filter((kernel) => kernel !== retired);
    expect(
      lumine.commands.canDispatch(
        list.getElement(),
        "jupyter-repl:connect-existing-kernel",
        list.getActionContext(),
      ),
    ).toBe(false);
    expect(
      lumine.commands.dispatch(list.getElement(), "jupyter-repl:connect-existing-kernel"),
    ).toBeNull();
    expect(await picker.selectKernel(retired)).toBe(false);
    expect(binding).not.toHaveBeenCalled();
  });
});
