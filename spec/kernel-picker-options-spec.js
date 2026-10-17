const KernelPicker = require("../lib/kernel-picker");
/* global conditionPromise */

describe("KernelPicker capabilities", () => {
  let picker;

  afterEach(() => picker?.destroy());

  it("omits the file-mutating kernel-comment action for notebook adapters", () => {
    picker = new KernelPicker([{ name: "python3", display_name: "Python 3", language: "python" }], {
      allowKernelComment: false,
    });

    expect(picker.selectList.props.actions.map((action) => action.command)).toEqual([
      "jupyter-repl:select-kernel",
      "jupyter-repl:refresh-kernel-list",
    ]);
    expect(picker.selectList.supportsKeepOpen()).toBe(false);
    expect(picker.selectList.getAvailableActions().map(({ command }) => command)).not.toContain(
      "select-list:toggle-keep-open",
    );
  });

  it("does not render a refresh that finishes after the picker is destroyed", async () => {
    let finishRefresh;
    picker = new KernelPicker([]);
    picker.onUpdate = () => new Promise((resolve) => (finishRefresh = resolve));
    spyOn(picker.selectList, "setLoadingState").and.returnValue(Promise.resolve());
    spyOn(picker.selectList, "setItems").and.returnValue(Promise.resolve());
    spyOn(picker.selectList, "clearLoadingState").and.returnValue(Promise.resolve());
    const pending = picker.updateKernels();
    await Promise.resolve();
    picker.destroy();
    finishRefresh([{ name: "python3", display_name: "Python 3" }]);
    await pending;
    expect(picker.selectList.setItems).not.toHaveBeenCalled();
    expect(picker.selectList.clearLoadingState).not.toHaveBeenCalled();
  });

  it("cancels a visible request exactly once across hide, cancel and destruction", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    picker = new KernelPicker([]);
    const cancelled = (picker.onCancelled = jasmine.createSpy("onCancelled"));
    await picker.toggle();

    picker.selectListHost.hide();
    picker.selectListHost.cancel();
    picker.destroy();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("ignores an older kernel refresh after hiding and reopening without another refresh", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    const original = { name: "python3", display_name: "Python 3" };
    picker = new KernelPicker([original]);
    await picker.toggle();
    let finish;
    picker.onUpdate = () => new Promise((resolve) => (finish = resolve));
    const pending = picker.updateKernels();
    await conditionPromise(() => finish != null);
    expect(finish).toEqual(jasmine.any(Function));
    expect(picker.selectList.getLoadingState().message).toBe("Loading kernels…");

    picker.selectListHost.hide();
    await picker.toggle();
    expect(picker.selectList.getLoadingState()).toBeNull();
    finish([{ name: "obsolete", display_name: "Obsolete" }]);
    await pending;

    expect(picker.kernelSpecs).toEqual([original]);
    expect(picker.selectList.getItems()).toEqual([original]);
    expect(picker.selectList.getLoadingState()).toBeNull();
  });

  it("settles cancellation before the request ever becomes visible", () => {
    picker = new KernelPicker([]);
    const cancelled = (picker.onCancelled = jasmine.createSpy("onCancelled"));

    picker.selectListHost.cancel();
    picker.destroy();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("starts a new settlement on a fresh opening", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    picker = new KernelPicker([]);
    const first = (picker.onCancelled = jasmine.createSpy("first cancellation"));
    await picker.toggle();
    picker.selectListHost.hide();

    const second = (picker.onCancelled = jasmine.createSpy("second cancellation"));
    await picker.toggle();
    picker.selectListHost.cancel();
    picker.destroy();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a new request opened by the previous cancellation callback", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    picker = new KernelPicker([]);
    const second = jasmine.createSpy("second cancellation");
    const first = jasmine.createSpy("first cancellation").and.callFake(() => {
      picker.onCancelled = second;
      picker.toggle();
    });
    picker.onCancelled = first;
    await picker.toggle();

    picker.selectListHost.cancel();
    expect(picker.selectListHost.isVisible()).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    picker.selectListHost.cancel();
    picker.destroy();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
