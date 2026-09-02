const { findCodeBlockAtRow, getCommentStartString } = require("../lib/code-manager");
const store = require("../lib/store");

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
  });

  it("captures a bracket-wrapped multiline string from its opening line", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.code).toBe("doc.x('''\n11\n''')");
    expect(block.row).toBe(2);
  });

  it("captures it with CRLF line endings", async () => {
    await open("doc.x('''\r\n11\r\n''')\r\n");
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.row).toBe(2);
    expect(block.code.replace(/\r/g, "")).toBe("doc.x('''\n11\n''')");
  });

  it("captures it from the closing line", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 2);
    expect(block.code).toBe("doc.x('''\n11\n''')");
  });

  it("captures a bare multiline string assignment", async () => {
    await open("x = '''\n11\n'''\n");
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.code).toBe("x = '''\n11\n'''");
  });

  it("captures a bare docstring from its opening and closing lines", async () => {
    await open("'''\ndoc\n'''\n");
    expect(findCodeBlockAtRow(editor, 0).code).toBe("'''\ndoc\n'''");
    expect(findCodeBlockAtRow(editor, 2).code).toBe("'''\ndoc\n'''");
  });

  it("captures a call whose closing bracket sits on its own line", async () => {
    await open("doc.x('''\n11\n'''\n)\n");
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.code).toBe("doc.x('''\n11\n'''\n)");
    expect(block.row).toBe(3);
  });

  it("runs a single line when the cursor is inside the string body", async () => {
    await open("doc.x('''\n11\n''')\n");
    const block = findCodeBlockAtRow(editor, 1);
    expect(block.code).toBe("11");
  });

  it("leaves single-line triple-quoted strings as a single line", async () => {
    await open("doc.x('''abc''')\nprint(1)\n");
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.code).toBe("doc.x('''abc''')");
    expect(block.row).toBe(0);
  });

  it("uses double triple-quotes the same way", async () => {
    await open('doc.x("""\n11\n""")\n');
    const block = findCodeBlockAtRow(editor, 0);
    expect(block.code).toBe('doc.x("""\n11\n""")');
  });

  it("uses the public syntax-node accessor for a Python block", async () => {
    await lumine.packages.activatePackage("language-python");
    editor = await lumine.workspace.open("syntax-node-block.py");
    editor.setText("def f():\n    value = 1\noutside = 2\n");
    await editor.getBuffer().getLanguageMode().atTransactionEnd();
    spyOnProperty(store.constructor.prototype, "kernel", "get").and.returnValue({
      language: "python",
    });
    const getSyntaxNode = spyOn(editor, "getSyntaxNodeAtBufferPosition").and.callThrough();

    const block = findCodeBlockAtRow(editor, 0);

    expect(getSyntaxNode).toHaveBeenCalled();
    expect(block.code.trimEnd()).toBe("def f():\n    value = 1");
    expect(block.row).toBe(1);
  });

  it("keeps the regex fallback when the syntax-node accessor returns null", async () => {
    await lumine.packages.activatePackage("language-python");
    editor = await lumine.workspace.open("syntax-node-fallback.py");
    editor.setText("def f():\n    value = 1\noutside = 2\n");
    await editor.getBuffer().getLanguageMode().atTransactionEnd();
    spyOnProperty(store.constructor.prototype, "kernel", "get").and.returnValue({
      language: "python",
    });
    spyOn(editor, "getSyntaxNodeAtBufferPosition").and.returnValue(null);

    const block = findCodeBlockAtRow(editor, 0);

    expect(block.code.trimEnd()).toBe("def f():\n    value = 1");
    expect(block.row).toBe(1);
  });
});

describe("comment delimiter lookup", () => {
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
