const { moveDown } = require("../lib/source-analysis/cursor-motion");

describe("execution cursor scrolling", () => {
  let editor;

  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    editor = lumine.workspace.buildTextEditor();
    editor.setText("first\n\nnext\nlast");
  });

  afterEach(() => {
    editor.destroy();
    lumine.config.unset("jupyter-repl.scrollOnMoveDown");
  });

  it("uses the shared zone once after moving past blank rows", () => {
    lumine.config.set("jupyter-repl.scrollOnMoveDown", "zone");
    const scroll = spyOn(editor, "scrollToScreenRange");
    moveDown(editor, 0);
    expect(editor.getCursorBufferPosition().toArray()).toEqual([2, 0]);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ mode: "zone" }));
  });

  it("preserves the viewport when execution scrolling is disabled", () => {
    lumine.config.set("jupyter-repl.scrollOnMoveDown", "none");
    const scroll = spyOn(editor, "scrollToScreenRange");
    moveDown(editor, 0);
    expect(editor.getCursorBufferPosition().toArray()).toEqual([2, 0]);
    expect(scroll).not.toHaveBeenCalled();
  });

  it("keeps explicit centering available through core", () => {
    lumine.config.set("jupyter-repl.scrollOnMoveDown", "center");
    const scroll = spyOn(editor, "scrollToScreenRange");
    moveDown(editor, 0);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ mode: "center" }));
  });

  it("follows the same zone when execution appends a line", () => {
    lumine.config.set("jupyter-repl.scrollOnMoveDown", "zone");
    const scroll = spyOn(editor, "scrollToScreenRange");
    moveDown(editor, 3);
    expect(editor.getText()).toBe("first\n\nnext\nlast\n");
    expect(editor.getCursorBufferPosition().toArray()).toEqual([4, 0]);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ mode: "zone" }));
  });
});
