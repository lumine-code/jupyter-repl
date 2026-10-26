describe("Jupyter source budgets", () => {
  let budget;
  beforeEach(() => {
    budget = require("../lib/source-budget");
  });

  it("checks selected-range metadata before reading an oversized source", () => {
    const editor = {
      getBuffer: () => ({
        clipPosition: (point) => ({ row: point[0], column: point[1] }),
        characterIndexForPosition: (point) => point.column,
      }),
      getTextInBufferRange: jasmine.createSpy("full range").and.throwError("must not read"),
    };
    expect(() =>
      budget.readRange(editor, [
        [0, 0],
        [0, 512 * 1024 * 1024],
      ]),
    ).toThrowError(/Execution source exceeds/);
    expect(() =>
      budget.readRange(editor, [
        [0, 512 * 1024 * 1024],
        [0, 0],
      ]),
    ).toThrowError(/Execution source exceeds/);
    expect(editor.getTextInBufferRange).not.toHaveBeenCalled();
  });

  it("rejects oversized direct kernel requests before registering or sending work", () => {
    const Kernel = require("../lib/kernel");
    const receiver = { _nextExecutionToken: 0, firstMiddlewareAdapter: {} };
    for (const operation of ["execute", "complete", "inspect"])
      expect(() =>
        Kernel.prototype[operation].call(receiver, { length: 512 * 1024 * 1024 }),
      ).toThrowError(/Execution source exceeds/);
    expect(receiver._nextExecutionToken).toBe(0);
  });

  it("bounds escaped JSON and the aggregate multipart frame before serialization", () => {
    expect(() =>
      budget.serializeMessage({ code: "\u0000".repeat(1000) }, { units: 0, limit: 100 }),
    ).toThrowError(/JSON transport budget/);
    const shared = { units: 0, limit: 400 };
    expect(JSON.parse(budget.serializeMessage({ code: "a".repeat(30) }, shared)).code).toBe(
      "a".repeat(30),
    );
    expect(() => budget.serializeMessage({ code: "b".repeat(30) }, shared)).toThrowError(
      /JSON transport budget/,
    );
    expect(() => budget.assertIncomingFrames([{ byteLength: 512 * 1024 * 1024 }])).toThrowError(
      /Incoming Jupyter JSON/,
    );
  });

  it("captures only executed traceback rows in a much larger document", () => {
    const { TextBuffer } = require("lumine");
    const buffer = new TextBuffer({ text: "x".repeat(2 * 1024 * 1024) + "\nwork()" });
    const editor = {
      getBuffer: () => buffer,
      getText: jasmine.createSpy("full source").and.throwError("must not read"),
      getGrammar: () => ({ scopeName: "source.python" }),
    };
    try {
      const { captureSource, rangeFor } = require("../lib/traceback-context");
      const snapshot = captureSource(editor, "work()", 1);
      expect(snapshot.lines).toEqual(["work()"]);
      expect(rangeFor(snapshot, { line: 1, column: 0 })).toEqual([
        [1, 0],
        [1, 0],
      ]);
      expect(editor.getText).not.toHaveBeenCalled();
      buffer.insert([1, 0], "changed ");
      expect(rangeFor(snapshot, { line: 1 })).toBeNull();
    } finally {
      buffer.destroy();
    }
  });
});
