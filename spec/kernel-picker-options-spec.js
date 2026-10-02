const KernelPicker = require("../lib/kernel-picker");

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
});
