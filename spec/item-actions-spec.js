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

  it("derives its actions from the command registrations and the keymap", () => {
    const actions = picker.selectList.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const insertComment = byCommand.get("jupyter-repl:insert-kernel-comment");
    expect(insertComment.name).toBe("Insert Kernel Comment");
    expect(insertComment.description).toBe(
      "Insert or update the kernel magic comment on the first line of the editor.",
    );
    expect(insertComment.keystrokes).toEqual(["ctrl-enter"]);

    const updateKernels = byCommand.get("jupyter-repl:refresh-kernel-list");
    expect(updateKernels.description).toBe("Rescan the kernel specs on disk and reload the list.");
    expect(updateKernels.keystrokes).toEqual(["f5"]);

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

  it("shows the actions as a flow step and runs one against the kernel list", async () => {
    picker.selectList.show();

    await picker.selectList.showItemActions();

    expect(picker.selectList.itemActionsList.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Kernels", "Actions"]);
    // The actions list wears the picker's classes, so the package keymap
    // resolves action keystrokes inside it too.
    expect(picker.selectList.itemActionsList.element.classList.contains("kernel-picker")).toBe(
      true,
    );

    const spy = spyOn(picker, "updateKernels");
    const index = picker.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-repl:refresh-kernel-list",
    );
    picker.selectList.itemActionsList.selectIndex(index);
    picker.selectList.itemActionsList.confirmSelection();

    expect(spy).toHaveBeenCalled();
    expect(picker.selectList.isVisible()).toBeTruthy();
    expect(picker.selectList.itemActionsList.isVisible()).toBeFalsy();
  });

  it("runs an action against the kernel the user highlighted", async () => {
    await lumine.packages.activatePackage("language-python");
    const editor = await lumine.workspace.open("kernel-comment.py");
    picker.selectList.show();
    // The second kernel, so an action that silently fell back to the top of
    // the list would name the wrong one.
    await picker.selectList.selectIndex(1);

    await picker.selectList.showItemActions();
    const index = picker.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "jupyter-repl:insert-kernel-comment",
    );
    picker.selectList.itemActionsList.selectIndex(index);
    picker.selectList.itemActionsList.confirmSelection();

    expect(editor.lineTextForBufferRow(0)).toBe("#:: ir");
  });
});
