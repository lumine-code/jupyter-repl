describe("result interactions in detached presentations", () => {
  let component, extra;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("jupyter-repl");
    const OutputStore = require("../lib/store/output");
    const ResultView = require("../lib/components/result-view/result-view");
    const store = new OutputStore();
    store.appendOutput({
      output_type: "stream",
      name: "stdout",
      text: "selected output\nsecond line",
    });
    component = new ResultView({ store, editor: null, showResult: true });
    component.layout.updatePosition({
      editorWidth: 500,
      lineLength: 0,
      charWidth: 8,
      lineHeight: 16,
    });
    require("@lumine-code/etch").updateSync(component);
    const item = {
      element: component.element,
      getTitle: () => "Detached result",
      canCopy: () => false,
    };
    await lumine.workspace.open(item);
    extra = await lumine.workspace.detachItem(item);
  });
  afterEach(async () => {
    component?.destroy();
    await lumine.workspace.discardEditorWindows();
    await lumine.packages.deactivatePackage("jupyter-repl");
  });

  it("keeps selecting output text from triggering a copy of the entire result", () => {
    const document = extra.getDocument();
    const range = document.createRange();
    range.selectNodeContents(component.refs.display);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toContain("selected output");
    const click = spyOn(component, "handleClick");
    component.checkForSelection({ target: component.refs.display });
    expect(click).not.toHaveBeenCalled();
  });

  it("resizes from local pointer events and ends the gesture before reattachment", async () => {
    const domWindow = extra.getDOMWindow();
    const display = component.refs.display;
    const width = display.offsetWidth;
    component.startResize(
      new domWindow.MouseEvent("mousedown", { button: 0, clientX: 110, clientY: 10 }),
    );
    domWindow.dispatchEvent(
      new domWindow.MouseEvent("mousemove", { buttons: 1, clientX: 10, clientY: 110 }),
    );
    expect(component.resizedWidth).toBe(Math.max(64, width - 100));
    expect(component.resizeOrigin).not.toBeNull();
    await lumine.workspace.attachWindow(extra);
    expect(component.resizeOrigin).toBeNull();
  });
});
