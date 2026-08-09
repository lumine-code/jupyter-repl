const { findCodeBlockAtRow } = require("../lib/code-manager");

// Multiline triple-quoted strings hide their brackets from the line-based
// bracket checks (`doc.x('''` ends with the string opener, `''')` starts with
// its closer). Detection must capture the whole statement without relying on
// a fold provider, so it works under any grammar (tree-sitter, TextMate, or
// plain text buffers).
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

  it("works under the TextMate python grammar, which has no string folds", async () => {
    lumine.config.set("language.useTreeSitterParsers", false);
    await lumine.packages.activatePackage("language-python");
    const e = await open("doc.x('''\n11\n''')\n");
    lumine.grammars.assignLanguageMode(e.getBuffer(), "source.python");
    expect(e.getBuffer().getLanguageMode().constructor.name).toBe("TextMateLanguageMode");
    const block = findCodeBlockAtRow(e, 0);
    expect(block.code).toBe("doc.x('''\n11\n''')");
    lumine.config.set("language.useTreeSitterParsers", true);
  });
});
