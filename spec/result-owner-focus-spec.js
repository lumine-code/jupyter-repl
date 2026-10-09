describe("Result owner cleanup focus", () => {
  let main, markers, first, second, view;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    main = (await lumine.packages.activatePackage("jupyter-repl")).mainModule;
    main.deserializeOutputPane();
    first = await lumine.workspace.open();
    first.setText("old result");
    const store = require("../lib/store");
    markers = store.markersMapping.get(first.id) || store.newMarkerStore(first.id, first);
    const ResultView = require("../lib/components/result-view");
    view = new ResultView(markers, first, 0);
    const pane = lumine.workspace.getActivePane().splitRight();
    second = lumine.workspace.buildTextEditor();
    pane.addItem(second);
    pane.activateItem(second);
    pane.activate();
    await lumine.views.getNextUpdatePromise();
    second.element.focus();
    expect(lumine.workspace.getFocusedTextEditor()).toBe(second);
  });
  afterEach(async () => {
    markers.clear();
    first.destroy();
    second.destroy();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });
  it("keeps the currently focused editor when a background result owner is withdrawn", () => {
    markers.destroy();
    expect(view.destroyed).toBe(true);
    expect(lumine.workspace.getFocusedTextEditor()).toBe(second);
  });
  it("keeps the currently focused editor when the package is deactivated", async () => {
    await lumine.packages.deactivatePackage("jupyter-repl");
    expect(view.destroyed).toBe(true);
    expect(lumine.workspace.getFocusedTextEditor()).toBe(second);
  });
  it("still returns focus to the result editor after an explicit middle-click close", () => {
    view.element.dispatchEvent(new MouseEvent("mousedown", { button: 1, bubbles: true }));
    expect(view.destroyed).toBe(true);
    expect(lumine.workspace.getFocusedTextEditor()).toBe(first);
  });
  it("still returns focus to the result editor after clicking its close button", () => {
    view.component.props.destroy();
    expect(view.destroyed).toBe(true);
    expect(lumine.workspace.getFocusedTextEditor()).toBe(first);
  });
  it("still returns focus to the result editor after the result close command", () => {
    lumine.commands.dispatch(view.element, "jupyter-repl:close-result");
    expect(view.destroyed).toBe(true);
    expect(lumine.workspace.getFocusedTextEditor()).toBe(first);
  });
});
