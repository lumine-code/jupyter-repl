const path = require("node:path");
const { createRequire } = require("node:module");

describe("Jupyter registration helper ownership", () => {
  afterEach(async () => {
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
  });

  it("shares cold spyable helper objects with activation and replaces them on reload", async () => {
    const packagePath = lumine.packages.resolvePackagePath("jupyter-repl");
    if (lumine.packages.isPackageLoaded("jupyter-repl"))
      await lumine.packages.unloadPackage("jupyter-repl");
    const firstRequire = createRequire(path.join(packagePath, "package.json"));
    const input = firstRequire("./lib/ui/input-controller");
    const mcp = firstRequire("./lib/services/provided/mcp-tools");
    const bootstrap = firstRequire("./lib/workspace-commands");
    const firstInputFactory = input.createInputController;
    const firstMcpFactory = mcp.createMcpTools;
    expect(input).toBe(bootstrap.inputController);
    expect(mcp).toBe(bootstrap.mcpTools);
    expect(Object.keys(input)).toEqual(["createInputController"]);
    expect(Object.keys(mcp)).toEqual(["createMcpTools"]);
    const createInput = spyOn(input, "createInputController").and.callThrough();
    const createTools = spyOn(mcp, "createMcpTools").and.callThrough();
    const pack = await lumine.packages.activatePackage("jupyter-repl");
    pack.mainModule.provideMcpTools();
    expect(createInput).toHaveBeenCalledTimes(1);
    expect(createTools).toHaveBeenCalledTimes(1);
    await lumine.packages.unloadPackage("jupyter-repl");
    const current = await lumine.packages.activatePackage("jupyter-repl");
    const currentRequire = createRequire(path.join(current.path, "package.json"));
    const currentBootstrap = currentRequire("./lib/workspace-commands");
    expect(currentRequire("./lib/ui/input-controller")).toBe(currentBootstrap.inputController);
    expect(currentRequire("./lib/services/provided/mcp-tools")).toBe(currentBootstrap.mcpTools);
    expect(currentBootstrap.inputController.createInputController).not.toBe(firstInputFactory);
    expect(currentBootstrap.mcpTools.createMcpTools).not.toBe(firstMcpFactory);
  });
});
