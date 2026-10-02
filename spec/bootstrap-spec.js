const path = require("path");

const PACKAGE_NAME = "jupyter-repl";
const PACKAGE_PATH = path.join(__dirname, "..");

describe("jupyter-repl bootstrap", () => {
  let pack, previousDebug;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    previousDebug = lumine.config.get("jupyter-repl.debug");
    pack = await lumine.packages.startPackage(PACKAGE_PATH);
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    lumine.config.set("jupyter-repl.debug", previousDebug);
  });

  it("starts with its synchronous facade and publishes services", () => {
    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
    expect(pack.mainModule).toBeTruthy();
    expect(pack.mainActivated).toBe(true);
  });

  it("runs the workspace command from the eager facade", async () => {
    await lumine.commands.dispatch(
      lumine.views.getView(lumine.workspace),
      "jupyter-repl:debug-toggle",
    );

    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
    expect(lumine.config.get("jupyter-repl.debug")).toBe(!previousDebug);
  });

  it("does not activate another package when a service is requested", async () => {
    expect(await lumine.packages.requestService("jupyter.kernel", "^1.0.0")).toBe(true);
    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
  });

  it("publishes an advertised service to a passive consumer", async () => {
    let outputService = null;
    const subscription = lumine.packages.serviceHub.consume(
      "jupyter.output",
      "^1.0.0",
      (service) => {
        outputService = service;
      },
    );
    await lumine.packages.activatePackage(PACKAGE_NAME);

    expect(outputService).toBeTruthy();
    subscription.dispose();
  });

  it("keeps a replacement cells provider when the old provider detaches", () => {
    const first = {};
    const second = {};
    const original = pack.mainModule.consumeJupyterCells(first);
    const replacement = pack.mainModule.consumeJupyterCells(second);
    original.dispose();
    expect(pack.mainModule.getJupyterCellsService()).toBe(second);
    replacement.dispose();
    expect(pack.mainModule.getJupyterCellsService()).toBeNull();
  });

  it("keeps a replacement image provider when the old provider detaches", () => {
    const first = {};
    const second = {};
    const original = pack.mainModule.consumeImageEditor(first);
    const replacement = pack.mainModule.consumeImageEditor(second);
    original.dispose();
    expect(pack.mainModule.getImageEditorService()).toBe(second);
    replacement.dispose();
    expect(pack.mainModule.getImageEditorService()).toBeNull();
  });
});
