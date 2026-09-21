const path = require("path");
const manifest = require("../package.json");
let main = require("../lib/main");
let commands = require("../lib/commands");
let result = require("../lib/result");
let store = require("../lib/store");
let OutputPane = require("../lib/panes/output-area");

const DESERIALIZER = "jupyter-repl/OutputPane";

// The output dock's presence is itself the output-mode switch. Restoring it
// must therefore produce the same singleton that the opener and toggle see,
// while kernel output remains runtime-only.
describe("restoring the Output Area pane", () => {
  let loadedPackage = null;

  beforeEach(() => {
    main = require("../lib/main");
    commands = require("../lib/commands");
    result = require("../lib/result");
    store = require("../lib/store");
    OutputPane = require("../lib/panes/output-area");
  });

  afterEach(async () => {
    if (loadedPackage && lumine.packages.isPackageActive(loadedPackage.name)) {
      await lumine.packages.deactivatePackage(loadedPackage.name);
    } else {
      main.deactivate();
    }
    if (loadedPackage && lumine.packages.isPackageLoaded(loadedPackage.name)) {
      await lumine.packages.unloadPackage(loadedPackage.name);
    }
    loadedPackage = null;
  });

  it("declares the deserializer method named by its serialized state", () => {
    expect(manifest.deserializers[DESERIALIZER]).toBe("deserializeOutputPane");
    expect(typeof main.deserializeOutputPane).toBe("function");
  });

  it("serializes only the pane's identity", () => {
    const item = main.deserializeOutputPane();
    item.component.setScrollList();

    expect(item.serialize()).toEqual({ deserializer: DESERIALIZER });
    expect(item.getDefaultLocation()).toBe("right");
    expect(item.getAllowedLocations()).toEqual(["right", "left"]);
  });

  it("round-trips through the manifest-registered proxy during bootstrap", () => {
    const source = new OutputPane(store);
    const state = source.serialize();
    source.destroy();

    spyOn(lumine.packages, "hasActivatedInitialPackages").and.returnValue(false);
    loadedPackage = lumine.packages.loadPackage(path.resolve(__dirname, ".."));

    const restored = lumine.deserializers.deserialize(state);

    expect(restored).toBeTruthy();
    expect(restored.serialize()).toEqual(state);
    expect(loadedPackage.mainInitialized).toBe(true);
    // Workspace restoration happens before the initial package batch finishes.
    // The deserializer may build the singleton from the loaded facade, but its
    // live activate hook waits for the normal bootstrap.
    expect(loadedPackage.mainActivated).toBe(false);
  });

  it("keeps the startup-restored item when activation and URI opening follow", async () => {
    const restored = main.deserializeOutputPane();

    main.activate();
    const opened = await lumine.workspace.open(restored.getURI(), { searchAllPanes: true });

    expect(opened).toBe(restored);
    expect(main.deserializeOutputPane()).toBe(restored);
  });

  it("lets the output-mode toggle close a restored item and then creates a new one", () => {
    const restored = main.deserializeOutputPane();
    const pane = lumine.workspace.getCenter().getActivePane();
    pane.addItem(restored);

    commands.toggleOutputMode();

    expect(pane.getItems()).not.toContain(restored);
    expect(main.deserializeOutputPane()).not.toBe(restored);
  });

  it("routes a real result into the output store selected by the restored pane", async () => {
    const previousEditor = store.editor;
    const previousActivePaneItem = store.activePaneItem;
    const previousOutputAreaDefault = lumine.config.get("jupyter-repl.outputAreaDefault");
    const previousResizeObserver = global.ResizeObserver;
    let editor = null;
    let markers = null;
    let restored = null;

    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    lumine.config.set("jupyter-repl.outputAreaDefault", false);

    try {
      restored = main.deserializeOutputPane();
      lumine.workspace.getRightDock().getActivePane().addItem(restored);
      main.activate();

      editor = await lumine.workspace.open();
      editor.setText("value()");
      store.updateEditor(editor);
      store.updateActivePaneItem(editor);
      markers = store.markers;

      const globalOutputStore = {
        setLastCode: jasmine.createSpy("setLastCode"),
        startNewRun: jasmine.createSpy("startNewRun"),
        appendOutput: jasmine.createSpy("appendOutput"),
      };
      const kernel = {
        outputStore: globalOutputStore,
        setLastOutputStore: jasmine.createSpy("setLastOutputStore"),
        execute: jasmine.createSpy("execute"),
      };

      result.createResult(
        { editor, kernel, markers },
        { code: "value()", row: 0, cellType: "codecell" },
      );

      expect(globalOutputStore.setLastCode).toHaveBeenCalledWith("value()");
      expect(globalOutputStore.startNewRun).toHaveBeenCalledTimes(1);
      expect(kernel.setLastOutputStore).toHaveBeenCalledWith(globalOutputStore);
      expect(kernel.execute).toHaveBeenCalled();
    } finally {
      restored?.destroy();
      markers?.clear();
      if (editor) {
        store.markersMapping.delete(editor.id);
      }
      store.updateEditor(previousEditor);
      store.updateActivePaneItem(previousActivePaneItem);
      lumine.config.set("jupyter-repl.outputAreaDefault", previousOutputAreaDefault);
      global.ResizeObserver = previousResizeObserver;
      editor?.destroy();
    }
  });

  it("destroys the restored component once when active teardown also runs", () => {
    const item = main.deserializeOutputPane();
    spyOn(item.component, "destroy").and.callThrough();
    main.activate();

    main.deactivate();

    expect(item.component.destroy).toHaveBeenCalledTimes(1);
  });
});
