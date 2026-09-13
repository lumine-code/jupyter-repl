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
});
