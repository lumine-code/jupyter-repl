const fs = require("fs");
const os = require("os");
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
      "jupyter-repl:open-example-with",
      "jupyter-repl:open-example-pending",
      "jupyter-repl:open-example-external",
      "jupyter-repl:show-example-in-folder",
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

  for (const pending of [false, true]) {
    it(`uses the configured ${pending ? "pending" : "permanent"} default opening`, async () => {
      const picker = new ExampleList();
      await picker.show();
      lumine.config.set("core.allowPendingPaneItems", pending);
      const open = spyOn(lumine.workspace, "open").and.resolveTo();
      const item = picker.selectList.getSelectedItem();

      await picker.selectList.confirmSelection();

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.pane).toBe(picker.openingPane);
      expect(options.pending).toBe(pending);
      expect(options.opener).toBeUndefined();
    });
  }

  it("uses the registered default opener and forces the text editor only for preview", async () => {
    const picker = new ExampleList();
    await picker.show();
    const item = picker.selectList.getSelectedItem();
    const viewer = jasmine.createSpy("example viewer").and.callFake(() => {
      const editor = lumine.workspace.buildTextEditor();
      editor.setText("Opened by the example viewer");
      return editor;
    });
    const registration = lumine.workspace.addPathOpener({
      id: "jupyter-example-viewer",
      label: "Example Viewer",
      pathKinds: ["file"],
      destinations: ["current"],
      canOpen: (uri) => uri === item.filePath,
      open: viewer,
    });
    try {
      await picker.selectList.confirmSelection();

      expect(viewer).toHaveBeenCalledTimes(1);
      expect(picker.openingPane.getActiveItem().getText()).toBe("Opened by the example viewer");
      lumine.config.set("core.allowPendingPaneItems", false);
      await picker.show();
      await picker.selectList.runAction("jupyter-repl:open-example-pending");

      const preview = picker.openingPane.getActiveItem();
      expect(preview.getPath()).toBe(item.filePath);
      expect(preview.getText()).toBe(fs.readFileSync(item.filePath, "utf8"));
      expect(picker.openingPane.getPendingItem()).toBe(preview);
      expect(preview.getSaveConfirmation().message).toBe(`Save changes to ${item.fileName}?`);
      expect(viewer).toHaveBeenCalledTimes(1);
    } finally {
      registration.dispose();
    }
  });

  it("passes the example path and captured pane to Open With", async () => {
    const picker = new ExampleList();
    await picker.show();
    const item = picker.selectList.getSelectedItem();
    const dispatch = spyOn(lumine.commands, "dispatch").and.resolveTo(true);

    await picker.openExample(item, "open-with");

    expect(dispatch).toHaveBeenCalledOnceWith(picker.window.getElement(), "open-with:toggle", {
      path: item.filePath,
      pane: picker.openingPane,
    });
  });

  it("keeps the captured pane when another pane takes focus", async () => {
    const picker = new ExampleList();
    await picker.show();
    const pane = picker.openingPane;
    pane.splitRight().activate();
    const open = spyOn(lumine.workspace, "open").and.resolveTo();

    await picker.selectList.runAction("jupyter-repl:open-example-pending");

    expect(open.calls.mostRecent().args[1].pane).toBe(pane);
    expect(open.calls.mostRecent().args[1].forcePending).toBe(true);
  });

  for (const [command, modifiers] of [
    ["jupyter-repl:open-example-with", { altKey: true }],
    ["jupyter-repl:open-example-pending", { shiftKey: true }],
    ["jupyter-repl:open-example-external", { ctrlKey: true, altKey: true }],
    ["jupyter-repl:show-example-in-folder", { ctrlKey: true, shiftKey: true }],
  ]) {
    it(`dispatches only ${command} from its row gesture`, async () => {
      const picker = new ExampleList();
      await picker.show();
      const run = spyOn(picker.selectList, "runAction").and.resolveTo();
      const row = picker.selectList.getElement().querySelector("li");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(run).toHaveBeenCalledOnceWith(command);
    });
  }

  for (const [command, key, code, modifiers] of [
    ["jupyter-repl:open-example-with", "Enter", "Enter", { altKey: true }],
    ["jupyter-repl:open-example-pending", "Enter", "Enter", { shiftKey: true }],
    ["jupyter-repl:open-example-external", "Enter", "Enter", { ctrlKey: true, altKey: true }],
    ["jupyter-repl:show-example-in-folder", "Enter", "Enter", { ctrlKey: true, shiftKey: true }],
  ]) {
    it(`dispatches ${command} from the query editor's keymap`, async () => {
      const picker = new ExampleList();
      await picker.show();
      let finish;
      const dispatched = new Promise((resolve) => (finish = resolve));
      const open = spyOn(picker, "openExample").and.callFake(() => finish());
      const target = picker.selectList.getQueryEditor().getElement();
      const event = new KeyboardEvent("keydown", {
        key,
        code,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      Object.defineProperty(event, "target", { value: target });

      lumine.keymaps.handleKeyboardEvent(event);
      await dispatched;

      expect(open.calls.mostRecent().args[0]).toBe(picker.selectList.getSelectedItem());
      expect(
        lumine.keymaps.findKeyBindings({ target: lumine.workspace.getElement(), command }),
      ).toEqual([]);
    });
  }

  for (const [mode, opener] of [
    ["external", "open-external"],
    ["reveal", "open-external:show"],
  ]) {
    it(`uses the registered ${opener} action when available`, async () => {
      const picker = new ExampleList();
      await picker.show();
      const item = picker.selectList.getSelectedItem();
      const open = spyOn(lumine.workspace, "open").and.resolveTo();
      spyOn(lumine.workspace, "getAvailablePathOpeners").and.returnValue([{ id: opener }]);

      await picker.openExample(item, mode);

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.opener).toBe(opener);
      expect(options.pane).toBe(picker.openingPane);
      expect(options.pathKind).toBe("file");
    });
  }

  it("does not open an example after the source signal or picker retires", async () => {
    const picker = new ExampleList();
    await picker.show();
    const item = picker.selectList.getSelectedItem();
    const open = spyOn(lumine.workspace, "open").and.resolveTo();
    const controller = new AbortController();
    controller.abort();

    await expectAsync(picker.openExample(item, "open", controller.signal)).toBeRejected();
    picker.destroy();
    await picker.openExample(item);

    expect(open).not.toHaveBeenCalled();
  });

  it("protects SDK and chooser openings before an examples picker exists", async () => {
    const filePath = path.join(EXAMPLES_DIRECTORY, "ex-matplotlib-2.py");
    const editor = await lumine.workspace.open(filePath, { opener: "text-editor" });

    expect(pickers).toEqual([]);
    expect(editor.getSaveConfirmation()).toEqual({
      message: "Save changes to ex-matplotlib-2.py?",
      detail:
        "Saving will overwrite the original Jupyter example shipped with the package. Use Save As to keep a separate copy.",
    });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-example-copy-"));
    try {
      const copy = path.join(directory, "example-user-copy.py");
      await editor.saveAs(copy);

      expect(editor.getSaveConfirmation()).toBeNull();
      expect(fs.readFileSync(copy, "utf8")).toBe(fs.readFileSync(filePath, "utf8"));
    } finally {
      editor.destroy();
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });

  it("does not protect files outside the examples directory", async () => {
    const editor = await lumine.workspace.open(path.join(PACKAGE_PATH, "README.md"), {
      opener: "text-editor",
    });

    expect(editor.getSaveConfirmation()).toBeNull();
  });

  it("ignores a save-protection listener copied before its package generation retired", async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
    let main;
    const retirement = lumine.workspace.onDidOpen(() => main.deactivate());
    main = (await lumine.packages.activatePackage(PACKAGE_PATH)).mainModule;
    try {
      const editor = await lumine.workspace.open(
        path.join(EXAMPLES_DIRECTORY, "ex-matplotlib-2.py"),
        { opener: "text-editor" },
      );

      expect(editor.getSaveConfirmation()).toBeNull();
    } finally {
      retirement.dispose();
    }
  });
});
