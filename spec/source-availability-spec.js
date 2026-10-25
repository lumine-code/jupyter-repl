describe("Jupyter source command availability", () => {
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
  });

  it("requires source ownership without requiring a running kernel", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("jupyter-repl");
    const target = lumine.workspace.getElement();
    for (const action of [
      "run",
      "run-and-move-down",
      "run-all-inline",
      "recalculate-all-inline",
      "clear-results",
    ])
      expect(lumine.commands.canDispatch(target, "jupyter-repl:" + action))
        .withContext(action)
        .toBe(false);
    expect(lumine.commands.canDispatch(target, "jupyter-repl:start-local-kernel")).toBe(true);
    const editor = await lumine.workspace.open();
    expect(lumine.commands.canDispatch(editor.getElement(), "jupyter-repl:run")).toBe(true);
    editor.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
});
