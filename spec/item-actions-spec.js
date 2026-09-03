const path = require("path");
const KernelPicker = require("../lib/kernel-picker");

// Activate by path, not by name: resolving the name would need this checkout
// linked into the packages directory, which is a property of whoever runs the
// suite rather than of the suite.
const PACKAGE_PATH = path.join(__dirname, "..");

describe("jupyter-repl kernel picker item actions", () => {
  let picker;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    // The package activates on its commands, so dispatch one to trigger it;
    // activation also loads the package keymap the actions list reads.
    const activation = lumine.packages.activatePackage(PACKAGE_PATH);
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-repl:debug-toggle");
    await activation;
    picker = new KernelPicker([
      { name: "python3", display_name: "Python 3" },
      { name: "ir", display_name: "R" },
    ]);
  });

  afterEach(async () => {
    picker.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("describes its explicit actions through command presentation", async () => {
    await picker.selectList.show();
    await picker.selectList.selectIndex(0);
    const actions = picker.selectList.getAvailableActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const selectKernel = byCommand.get("jupyter-repl:select-kernel");
    expect(selectKernel.name).toBe("Select Kernel");
    expect(selectKernel.description).toBe(
      "Choose the selected kernel for the request that opened this picker.",
    );
    expect(selectKernel.keystrokes).toEqual(["enter"]);

    const insertComment = byCommand.get("jupyter-repl:insert-kernel-comment");
    expect(insertComment.name).toBe("Insert Kernel Comment");
    expect(insertComment.description).toBe(
      "Insert or update the kernel magic comment on the first line of the editor.",
    );
    expect(insertComment.keystrokes).toEqual(["ctrl-enter"]);

    const updateKernels = byCommand.get("jupyter-repl:refresh-kernel-list");
    expect(updateKernels.description).toBe("Rescan the kernel specs on disk and reload the list.");
    expect(updateKernels.keystrokes).toEqual(["f5"]);
    expect(updateKernels.context).toBe("dialog");

    // Every action explains itself with more than a restated title.
    for (const action of actions) {
      expect(action.description).toBeTruthy();
    }

    // Chrome and global commands stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("select-list:actions")).toBe(false);
    expect(byCommand.has("jupyter-repl:run")).toBe(false);
    expect(byCommand.has("jupyter-repl:debug-toggle")).toBe(false);
  });

  it("keeps refresh available when no kernel is selected", async () => {
    await picker.selectList.setItems([]);

    expect(picker.selectList.getAvailableActions().map((action) => action.command)).toEqual([
      "jupyter-repl:refresh-kernel-list",
    ]);
  });

  it("selects the highlighted kernel exactly once through its semantic action", async () => {
    picker.onConfirmed = jasmine.createSpy("onConfirmed");
    await picker.selectList.show();
    await picker.selectList.selectIndex(1);

    await picker.selectList.runAction("jupyter-repl:select-kernel", { source: "spec" });

    expect(picker.onConfirmed).toHaveBeenCalledOnceWith(picker.kernelSpecs[1]);
    expect(picker.selectList.isVisible()).toBe(false);
  });

  it("runs a staying dialog action against the kernel list", async () => {
    await picker.selectList.show();
    const spy = spyOn(picker, "updateKernels");
    await picker.selectList.runAction("jupyter-repl:refresh-kernel-list", { source: "spec" });

    expect(spy).toHaveBeenCalled();
    expect(picker.selectList.isVisible()).toBeTruthy();
  });

  it("runs an action against the kernel the user highlighted", async () => {
    await lumine.packages.activatePackage("language-python");
    const editor = await lumine.workspace.open("kernel-comment.py");
    await picker.selectList.show();
    // The second kernel, so an action that silently fell back to the top of
    // the list would name the wrong one.
    await picker.selectList.selectIndex(1);

    await picker.selectList.runAction("jupyter-repl:insert-kernel-comment", { source: "spec" });

    expect(editor.lineTextForBufferRow(0)).toBe("#:: ir");
  });
});
