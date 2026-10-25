const { kernelForEditor, captureEditorContext } = require("../lib/execution-context");

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

describe("worker execution grammar", () => {
  let editor, previous, store, python;
  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    previous = lumine.grammars.syntaxExecution;
    lumine.grammars.syntaxExecution = "worker";
    for (const name of ["language-gfm", "language-python"])
      await lumine.packages.activatePackage(name);
    editor = lumine.workspace.buildTextEditor();
    editor.setText("introduction\n".repeat(400) + "```python\nprint(1)\n```\n");
    const markdown = lumine.grammars.grammarForScopeName("source.gfm");
    python = lumine.grammars.grammarForScopeName("source.python");
    lumine.grammars.assignGrammar(editor.getBuffer(), markdown);
    editor.setCursorBufferPosition([401, 3]);
    await editor.whenGrammarSettled();
    store = {
      editor: null,
      globalMode: false,
      getEmbeddedGrammar: () => markdown,
      markersMapping: new Map(),
      kernelMapping: new Map(),
    };
  });
  afterEach(() => {
    editor?.destroy();
    lumine.grammars.syntaxExecution = previous;
  });

  it("selects the embedded kernel before offscreen paint is available", async () => {
    const kernel = {};
    store.kernelMapping.set(`Unsaved Editor ${editor.id}`, new Map([[python.name, kernel]]));
    const context = await captureEditorContext(store, editor);
    expect(context.grammar).toBe(python);
    expect(context.kernel).toBe(kernel);
    expect(context.isCurrent()).toBeTrue();
    editor.getBuffer().insert([401, 0], "# ");
    expect(context.isCurrent()).toBeFalse();
  });

  it("cancels kernel selection when the cursor moves during syntax preparation", async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const original = editor.getScopeDescriptorsForBufferPositions.bind(editor);
    spyOn(editor, "getScopeDescriptorsForBufferPositions").and.callFake(async (...args) => {
      const value = await original(...args);
      await gate;
      return value;
    });
    const pending = captureEditorContext(store, editor);
    editor.setCursorBufferPosition([0, 0]);
    release();
    expect(await pending).toBeNull();
  });
});
