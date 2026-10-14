const fs = require("fs");
const path = require("path");

const PACKAGE_PATH = path.join(__dirname, "..");
const EXAMPLES_DIRECTORY = path.join(PACKAGE_PATH, "examples");

describe("jupyter-repl example picker", () => {
  let ExampleList, pickers;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage(PACKAGE_PATH);
    ExampleList = require("../lib/example-list");
    pickers = [];
    const show = ExampleList.prototype.show;
    spyOn(ExampleList.prototype, "show").and.callFake(function () {
      if (!pickers.includes(this)) pickers.push(this);
      return show.call(this);
    });
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
    for (const picker of pickers) picker.destroy();
    await lumine.workspace.discardEditorWindows();
  });

  it("lists only files from the package examples in natural filename order", async () => {
    const files = ["example-10.py", "example-2.py", "example-1.py"].map((name) => ({
      name,
      isFile: () => true,
    }));
    files.splice(1, 0, { name: "subdirectory", isFile: () => false });
    const read = spyOn(fs.promises, "readdir").and.resolveTo(files);
    const picker = new ExampleList();

    await picker.show();

    expect(read.calls.mostRecent().args[0]).toBe(EXAMPLES_DIRECTORY);
    expect(picker.selectList.getItems()).toEqual(
      ["example-1.py", "example-2.py", "example-10.py"].map((fileName) => ({
        fileName,
        filePath: path.join(EXAMPLES_DIRECTORY, fileName),
      })),
    );
  });

  it("filters filenames and opens the confirmed file in the initiating window", async () => {
    const workspace = lumine.workspace;
    const first = await workspace.open();
    const mainPane = workspace.paneForItem(first);
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    const targetPane = extra.getEditorContainer().getActivePane();
    targetPane.activateItem(second, { activatePane: true });

    await lumine.commands.dispatch(extra.getElement(), "jupyter-repl:show-examples");
    const picker = pickers[0];
    await picker.selectList.setQuery("matplotlib-2");
    expect(picker.selectList.getFilteredItems().map((item) => item.fileName)).toEqual([
      "ex-matplotlib-2.py",
    ]);
    expect(picker.selectList.getAvailableActions().map((action) => action.command)).toEqual([
      "jupyter-repl:open-example",
    ]);
    mainPane.activateItem(first, { activatePane: true });

    await picker.selectList.confirmSelection();

    const opened = targetPane.getActiveItem();
    const filePath = path.join(EXAMPLES_DIRECTORY, "ex-matplotlib-2.py");
    expect(opened.getPath()).toBe(filePath);
    expect(opened.getText()).toBe(fs.readFileSync(filePath, "utf8"));
    expect(opened.getSaveConfirmation()).toEqual({
      message: "Save changes to ex-matplotlib-2.py?",
      detail:
        "Saving will overwrite the original Jupyter example shipped with the package. Use Save As to keep a separate copy.",
    });
    expect(workspace.paneForItem(opened)).toBe(targetPane);
    expect(mainPane.getActiveItem()).toBe(first);
    expect(picker.selectListHost.isVisible()).toBe(false);
  });

  it("shows the picker from a noneditor target without opening an application window", async () => {
    const workspace = lumine.workspace;
    const target = workspace.getElement().ownerDocument.createElement("button");
    workspace.getElement().appendChild(target);
    const openApplication = spyOn(lumine.application, "openWindow");
    const openWindow = spyOn(workspace, "openEditorWindow");

    try {
      await lumine.commands.dispatch(target, "jupyter-repl:show-examples");

      expect(pickers.length).toBe(1);
      expect(pickers[0].selectListHost.isVisible()).toBe(true);
      expect(pickers[0].selectList.getItems().length).toBeGreaterThan(0);
      expect(openApplication).not.toHaveBeenCalled();
      expect(openWindow).not.toHaveBeenCalled();
      const commands = lumine.commands.findCommands({ target }).map((command) => command.name);
      expect(commands).toContain("jupyter-repl:show-examples");
      expect(commands).not.toContain("jupyter-repl:open-examples");
      expect(commands).not.toContain("jupyter-repl:open-example");
    } finally {
      target.remove();
    }
  });

  it("reuses the window picker and destroys it when the package deactivates", async () => {
    const target = lumine.workspace.getElement();
    await lumine.commands.dispatch(target, "jupyter-repl:show-examples");
    const picker = pickers[0];
    await picker.selectListHost.cancel();

    await lumine.commands.dispatch(target, "jupyter-repl:show-examples");

    expect(pickers).toEqual([picker]);
    expect(picker.selectListHost.isVisible()).toBe(true);
    const element = picker.selectList.getElement();
    await lumine.packages.deactivatePackage("jupyter-repl");
    expect(picker.destroyed).toBe(true);
    expect(element.isConnected).toBe(false);
  });

  it("does not recreate a picker from a command handler copied before deactivation", async () => {
    const main = lumine.packages.getActivePackage("jupyter-repl").mainModule;
    const create = spyOn(lumine.workspace, "addSelectList").and.callThrough();
    const retirement = lumine.commands.add("lumine-workspace", "jupyter-repl:show-examples", () =>
      main.deactivate(),
    );

    try {
      await lumine.commands.dispatch(lumine.workspace.getElement(), "jupyter-repl:show-examples");

      expect(create).not.toHaveBeenCalled();
      expect(pickers.length).toBe(0);
    } finally {
      retirement.dispose();
    }
  });

  it("keeps window searches independent and releases the closed window picker", async () => {
    const workspace = lumine.workspace;
    const main = workspace.getMainWindow();
    const extra = await workspace.openEditorWindow({ show: false });

    await lumine.commands.dispatch(main.getElement(), "jupyter-repl:show-examples");
    await lumine.commands.dispatch(extra.getElement(), "jupyter-repl:show-examples");
    const [local, remote] = pickers;
    expect(pickers.length).toBe(2);
    expect(local.selectListHost.isVisible()).toBe(true);
    expect(remote.selectListHost.isVisible()).toBe(true);
    expect(local.selectList.getElement().ownerDocument).toBe(main.getDocument());
    expect(remote.selectList.getElement().ownerDocument).toBe(extra.getDocument());
    await local.selectList.setQuery("matplotlib");
    await remote.selectList.setQuery("print");
    expect(local.selectList.getQuery()).toBe("matplotlib");
    expect(remote.selectList.getQuery()).toBe("print");

    await workspace.attachWindow(extra);

    expect(extra.isDestroyed()).toBe(true);
    expect(remote.destroyed).toBe(true);
    expect(local.destroyed).toBe(false);
    expect(local.selectListHost.isVisible()).toBe(true);
  });
});
