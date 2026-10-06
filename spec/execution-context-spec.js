const { kernelForEditor } = require("../lib/execution-context");

describe("editor kernel resolution", () => {
  it("resolves the captured embedded language after the cursor enters another language", () => {
    const python = { name: "Python" };
    const javascript = { name: "JavaScript" };
    const original = {};
    const other = {};
    const editor = { getPath: () => "mixed.md" };
    const store = {
      editor,
      activePaneItem: editor,
      grammar: javascript,
      kernel: other,
      getEmbeddedGrammar: () => javascript,
      kernelMapping: new Map([
        [
          "mixed.md",
          new Map([
            ["Python", original],
            ["JavaScript", other],
          ]),
        ],
      ]),
    };
    expect(kernelForEditor(editor, store, python)).toBe(original);
    expect(kernelForEditor(editor, store)).toBe(other);
  });
});
