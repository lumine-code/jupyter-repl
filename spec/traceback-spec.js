const Traceback = require("../lib/components/result-view/traceback");
const { parseTraceback } = require("../lib/traceback");
const {
  captureSource,
  rangeFor,
  captureExecution,
  resolverForOutput,
} = require("../lib/traceback-context");

describe("traceback navigation", () => {
  let view;
  afterEach(() => view?.destroy());

  it("recognizes ANSI IPython frames and classic quoted Windows paths", () => {
    const parts = parseTraceback(
      '\u001b[32mCell In[17], line 2\u001b[0m\n    1/0\n  File "C:\\work\\a b.py", line 9, in f\n    f()\nZeroDivisionError: division by zero',
      "ZeroDivisionError",
    );
    expect(parts.filter((part) => part.location).map((part) => part.location)).toEqual([
      { executionCount: 17, line: 2 },
      { filename: "C:\\work\\a b.py", line: 9 },
    ]);
  });

  it("keeps the exception visible while library frames are folded", () => {
    view = new Traceback({
      output: {
        ename: "ValueError",
        traceback: [
          "Traceback (most recent call last):",
          '  File "/venv/lib/python3.13/site-packages/demo.py", line 3, in f',
          "    raise ValueError('bad')",
          "ValueError: bad",
        ],
      },
    });
    const details = view.element.querySelector("details");
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("library frame");
    expect(details.textContent).not.toContain("ValueError: bad");
    expect(view.element.textContent).toContain("ValueError: bad");
  });

  it("opens existing local source files at the requested line", async () => {
    const open = spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve({}));
    view = new Traceback({
      output: { traceback: [`  File "${__filename}", line 4, in example`, "RuntimeError: bad"] },
    });
    view.element.querySelector("button").click();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith(__filename, { initialLine: 3, initialColumn: 0 });
  });

  it("leaves unsupported kernel tracebacks and missing or remote paths readable", () => {
    view = new Traceback({
      output: {
        traceback: [
          "Julia stacktrace",
          "<script>bad()</script>",
          '  File "https://example.com/code.py", line 5',
          "Error: bad",
        ],
      },
    });
    expect(view.element.querySelector("button")).toBeFalsy();
    expect(view.element.querySelector("script")).toBeFalsy();
    expect(view.element.textContent).toContain("<script>bad()</script>");
  });

  it("parses a SyntaxError underline as an exact end-exclusive range", () => {
    const [part] = parseTraceback(
      "Cell In[4], line 1\n    if True print('x')\n            ^^^^^\nSyntaxError: invalid syntax",
      "SyntaxError",
    );
    expect(part.location.column).toBe(8);
    expect(part.location.endColumn).toBe(13);
    const editor = { getText: () => "if True print('x')" };
    expect(rangeFor(captureSource(editor, editor.getText(), 0), part.location)).toEqual([
      [0, 8],
      [0, 13],
    ]);
  });

  it("maps dedented execution rows back to the original selected block", () => {
    const editor = { getText: () => "before\n    x = 1\n    y = x / 0\nafter" };
    const snapshot = captureSource(editor, "x = 1\ny = x / 0", 2);
    expect(rangeFor(snapshot, { line: 2, column: 8, endColumn: 9 })).toEqual([
      [2, 12],
      [2, 13],
    ]);
  });

  it("refuses source links after source edits and for unmappable magic transformations", () => {
    let text = "x = 1\nx / 0";
    const editor = { getText: () => text };
    const snapshot = captureSource(editor, text, 1);
    text = "different()\nx / 0";
    expect(rangeFor(snapshot, { line: 2 })).toBe(null);
    expect(captureSource(editor, "get_ipython().run_cell_magic('bash', '', 'echo hello')", 1)).toBe(
      null,
    );
  });

  it("maps normalized Python source back into a CRLF buffer", () => {
    const editor = { getText: () => "before\r\nx = 1\r\nx / 0\r\nafter" };
    const snapshot = captureSource(editor, "x = 1\nx / 0", 2);
    expect(rangeFor(snapshot, { line: 2 })).toEqual([
      [2, 0],
      [2, 0],
    ]);
  });

  it("binds older frame counts to executed snapshots instead of the newest source", () => {
    const kernel = {};
    const editor = { getText: () => "def f():\n    return 1 / 0\nf()" };
    const first = captureExecution(editor, kernel, "def f():\n    return 1 / 0", 1);
    first({ stream: "execution_count", data: 17 });
    const second = captureExecution(editor, kernel, "f()", 2);
    second({ stream: "execution_count", data: 18 });
    const error = { output_type: "error" };
    second(error);
    const resolve = resolverForOutput(error);
    expect(resolve({ executionCount: 17, line: 2 })).toBeTruthy();
    expect(resolve({ executionCount: 18, line: 2 })).toBe(null);
    expect(resolve({ executionCount: 19, line: 1 })).toBe(null);
  });

  it("does not reuse a previous kernel generation's count for new outputs", () => {
    const kernel = {};
    const editor = { getText: () => "first()\nsecond()" };
    const first = captureExecution(editor, kernel, "first()", 0);
    first({ stream: "execution_count", data: 1 });
    first({ stream: "execution_count", data: 1 });
    const second = captureExecution(editor, kernel, "second()", 1);
    second({ stream: "execution_count", data: 1 });
    const error = { output_type: "error" };
    second(error);
    expect(resolverForOutput(error)({ executionCount: 1, line: 2 })).toBe(null);
  });

  it("clears old provenance on restart even after the first count left the history limit", () => {
    const kernel = {};
    const editor = { getText: () => "work()" };
    for (let count = 1; count <= 201; count++) {
      captureExecution(editor, kernel, "work()", 0)({ stream: "execution_count", data: count });
    }
    const next = captureExecution(editor, kernel, "work()", 0);
    next({ stream: "execution_count", data: 1 });
    const error = { output_type: "error" };
    next(error);
    expect(resolverForOutput(error)({ executionCount: 201, line: 1 })).toBe(null);
  });
});
