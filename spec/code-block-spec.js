let findCodeBlockAtRow, getCommentStartString;
const pythonContext = { kernel: { language: "python" } };

function refreshPackageModules() {
  // Earlier lifecycle suites unload the package and discard its module cache.
  // Reacquire the compatibility facade from the current package generation.
  ({ findCodeBlockAtRow, getCommentStartString } = require("../lib/code-manager"));
}

// Multiline triple-quoted strings hide their brackets from the line-based
// bracket checks (`doc.x('''` ends with the string opener, `''')` starts with
// its closer). Detection must capture the whole statement without relying on
// a fold provider, so it works independently of grammar folds and in plain
// text buffers.
describe("code block detection for multiline strings", () => {
  let editor;

  const open = async (text) => {
    editor = await lumine.workspace.open();
    editor.getBuffer().setText(text);
    return editor;
  };

  beforeEach(() => {
    lumine.packages.deactivatePackages();
    refreshPackageModules();
  });

  it("captures a bracket-wrapped multiline string from its opening line", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.code).toBe("doc.x('''\n11\n''')");
    expect(block.row).toBe(2);
  });

  it("captures it with CRLF line endings", async () => {
    await open("doc.x('''\r\n11\r\n''')\r\n");
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.row).toBe(2);
    expect(block.code.replace(/\r/g, "")).toBe("doc.x('''\n11\n''')");
  });

  it("captures it from the closing line", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 2, pythonContext);
    expect(block.code).toBe("doc.x('''\n11\n''')");
  });

  it("captures a bare multiline string assignment", async () => {
    await open("x = '''\n11\n'''\n");
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.code).toBe("x = '''\n11\n'''");
  });

  it("captures a bare docstring from its opening and closing lines", async () => {
    await open("'''\ndoc\n'''\n");
    expect(findCodeBlockAtRow(editor, 0, pythonContext).code).toBe("'''\ndoc\n'''");
    expect(findCodeBlockAtRow(editor, 2, pythonContext).code).toBe("'''\ndoc\n'''");
  });

  it("captures a call whose closing bracket sits on its own line", async () => {
    await open("doc.x('''\n11\n'''\n)\n");
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.code).toBe("doc.x('''\n11\n'''\n)");
    expect(block.row).toBe(3);
  });

  it("runs a single line when the cursor is inside the string body", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 1, pythonContext);
    expect(block.code).toBe("11");
  });

  it("leaves single-line triple-quoted strings as a single line", async () => {
    await open("doc.x('''abc''')\nprint(1)\n");
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.code).toBe("doc.x('''abc''')");
    expect(block.row).toBe(0);
  });

  it("uses double triple-quotes the same way", async () => {
    await open('doc.x("""\n11\n""")\n');
    const block = findCodeBlockAtRow(editor, 0, pythonContext);
    expect(block.code).toBe('doc.x("""\n11\n""")');
  });

  it("detects a Python block after grammar resources are ready", async () => {
    const pythonPackage = await lumine.packages.activatePackage("language-python");
    await pythonPackage.resourceLoadPromise;
    editor = await lumine.workspace.open("syntax-node-block.py");
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python"));
    editor.setText("def f():\n    value = 1\noutside = 2\n");
    await editor.getBuffer().getLanguageMode().atTransactionEnd();
    const block = findCodeBlockAtRow(editor, 0, pythonContext);

    expect(block.code.trimEnd()).toBe("def f():\n    value = 1");
    expect(block.row).toBe(1);
  });

  it("keeps the regex fallback when the syntax-node accessor returns null", async () => {
    const pythonPackage = await lumine.packages.activatePackage("language-python");
    await pythonPackage.resourceLoadPromise;
    editor = await lumine.workspace.open("syntax-node-fallback.py");
    editor.setGrammar(lumine.grammars.grammarForScopeName("source.python"));
    editor.setText("def f():\n    value = 1\noutside = 2\n");
    await editor.getBuffer().getLanguageMode().atTransactionEnd();
    spyOn(editor, "getSyntaxNodeAtBufferPosition").and.returnValue(null);

    const block = findCodeBlockAtRow(editor, 0, pythonContext);

    expect(block.code.trimEnd()).toBe("def f():\n    value = 1");
    expect(block.row).toBe(1);
  });
});

describe("comment delimiter lookup", () => {
  beforeEach(refreshPackageModules);
  it("uses the first non-whitespace position and a block opener fallback", () => {
    const getCommentDelimitersForBufferPosition = jasmine
      .createSpy("getCommentDelimitersForBufferPosition")
      .and.returnValue({ block: ["<!-- ", " -->"] });
    const editor = {
      getCursorBufferPosition: () => ({ row: 3, column: 14 }),
      lineTextForBufferRow: () => "\t  value",
      getCommentDelimitersForBufferPosition,
    };

    expect(getCommentStartString(editor)).toBe("<!--");
    expect(getCommentDelimitersForBufferPosition).toHaveBeenCalledWith([3, 3]);
  });
});

describe("Python compound blocks without syntax-tree or fold support", () => {
  let editor;

  beforeEach(async () => {
    refreshPackageModules();
    editor = await lumine.workspace.open();
    spyOn(editor, "getGrammar").and.returnValue({ scopeName: "source.python", name: "Python" });
    spyOn(editor, "getSyntaxNodeAtBufferPosition").and.returnValue(null);
    spyOn(editor, "isFoldableAtBufferRow").and.returnValue(false);
  });

  afterEach(() => editor.destroy());

  it("captures try and its complete continuation chain from every header", () => {
    const source =
      "try: # guarded\n    first()\nexcept: # fallback\n    second()\nelse:\n    third()\nfinally:\n    cleanup()";
    editor.setText(source + "\noutside()");

    for (const row of [0, 2, 4, 6]) {
      const block = findCodeBlockAtRow(editor, row, pythonContext);
      expect(block.code.trimEnd()).withContext(`header row ${row}`).toBe(source);
      expect(block.row).toBe(7);
    }
  });

  it("finds the complete match statement from either case", () => {
    const source = "match value:\n    case 1:\n        first()\n    case _:\n        other()";
    editor.setText(source + "\noutside()");

    for (const row of [1, 3]) {
      const block = findCodeBlockAtRow(editor, row, pythonContext);
      expect(block.code.trimEnd()).toBe(source);
      expect(block.row).toBe(4);
    }
  });

  it("captures an async loop and its else clause", () => {
    const source = "async for item in items:\n    consume(item)\nelse: # exhausted\n    done()";
    editor.setText(source + "\noutside()");

    for (const row of [0, 2]) {
      const block = findCodeBlockAtRow(editor, row, pythonContext);
      expect(block.code.trimEnd()).toBe(source);
      expect(block.row).toBe(3);
    }
  });

  it("uses an explicit Python kernel without resolving the active context", () => {
    const resolve = spyOn(require("../lib/execution-context"), "kernelForEditor").and.throwError(
      "the caller already captured its kernel",
    );
    editor.setText("if ready:\n    run()\nelse:\n    wait()\noutside()");

    const block = findCodeBlockAtRow(editor, 0, pythonContext);

    expect(block.code.trimEnd()).toBe("if ready:\n    run()\nelse:\n    wait()");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("retains an explicitly absent kernel instead of borrowing another editor's", () => {
    const resolve = spyOn(require("../lib/execution-context"), "kernelForEditor").and.returnValue({
      language: "python",
    });
    editor.setText("if ready:\n    run()\nelse:\n    wait()");

    const block = findCodeBlockAtRow(editor, 0, { kernel: null });

    expect(block.code).toBe("if ready:");
    expect(block.row).toBe(0);
    expect(resolve).not.toHaveBeenCalled();
  });
});
