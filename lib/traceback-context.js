const outputs = new WeakMap();
const kernels = new WeakMap();

// A source mapping is captured before dispatch. Never search the current buffer
// for similar code at click time: that can navigate to a different execution.
function captureSource(editor, code, endRow) {
  const source = editor?.getText?.();
  if (typeof source !== "string" || typeof code !== "string") return null;
  const lines = source.split(/\r?\n/);
  const submitted = code.replace(/\r?\n$/, "").split(/\r?\n/);
  const startRow = endRow - submitted.length + 1;
  if (!Number.isInteger(startRow) || startRow < 0) return null;
  const actual = lines.slice(startRow, endRow + 1);
  if (actual.length !== submitted.length) return null;
  const indents = actual.map((line, index) => {
    if (line === submitted[index]) return 0;
    if (submitted[index] && line.endsWith(submitted[index])) {
      const prefix = line.slice(0, line.length - submitted[index].length);
      if (/^\s*$/.test(prefix)) return prefix.length;
    }
    return line.trim() === "" && submitted[index].trim() === "" ? 0 : null;
  });
  if (indents.some((indent) => indent === null)) return null;
  return { editor, source, code, startRow, indents };
}

function rangeFor(snapshot, frame) {
  if (!snapshot || snapshot.editor.isDestroyed?.() || snapshot.editor.getText() !== snapshot.source)
    return null;
  const index = frame.line - 1;
  if (!Number.isInteger(index) || index < 0 || index >= snapshot.indents.length) return null;
  const row = snapshot.startRow + index;
  const sourceLine = snapshot.source.split(/\r?\n/)[row];
  const indent = snapshot.indents[index];
  const printedSource = frame.sourceLine;
  const syntaxIndent = printedSource != null ? sourceLine.slice(indent).indexOf(printedSource) : 0;
  if (
    printedSource != null &&
    (syntaxIndent < 0 || !/^\s*$/.test(sourceLine.slice(indent, indent + syntaxIndent)))
  )
    return null;
  const column = frame.column == null ? 0 : frame.column + indent + syntaxIndent;
  if (frame.sourceLine != null && sourceLine.slice(indent).trim() !== frame.sourceLine.trim())
    return null;
  if (column > sourceLine.length) return null;
  const endColumn =
    frame.endColumn == null
      ? column
      : Math.min(sourceLine.length, frame.endColumn + indent + syntaxIndent);
  return [
    [row, column],
    [row, endColumn],
  ];
}

function sourceLink(snapshot, frame, reveal) {
  const range = rangeFor(snapshot, frame);
  if (!range) return null;
  return {
    title: "Go to the source of this execution",
    async open() {
      const current = rangeFor(snapshot, frame);
      if (!current) {
        lumine.notifications.addWarning(
          "The source changed since this execution. Run it again to update traceback links.",
        );
        return;
      }
      reveal?.();
      await lumine.workspace.open(snapshot.editor, { searchAllPanes: true });
      const afterOpen = rangeFor(snapshot, frame);
      if (!afterOpen) return;
      snapshot.editor.setSelectedBufferRange(afterOpen);
      snapshot.editor.scrollToBufferPosition(afterOpen[0], { center: true });
      lumine.views.getView(snapshot.editor)?.focus?.();
    },
  };
}

function captureExecution(editor, kernel, code, row) {
  let counts = kernels.get(kernel);
  if (!counts) kernels.set(kernel, (counts = new Map()));
  const snapshot = captureSource(editor, code, row);
  let executionCount = null;
  return (output) => {
    if (
      output?.stream === "execution_count" &&
      Number.isSafeInteger(output.data) &&
      output.data > 0
    ) {
      if (executionCount === output.data) return;
      executionCount = output.data;
      // A reused count is a new kernel generation. Existing output resolvers
      // retain their own immutable count map; new runs cannot inherit it.
      if (executionCount <= (Array.from(counts.keys()).at(-1) ?? 0)) counts.clear();
      counts.set(executionCount, snapshot);
      while (counts.size > 200) counts.delete(counts.keys().next().value);
    }
    if (output && typeof output === "object") {
      const history = output.output_type === "error" ? new Map(counts) : null;
      outputs.set(output, {
        kernel,
        resolveTracebackFrame: (frame) => {
          const target =
            frame.executionCount != null
              ? history?.get(frame.executionCount)
              : /^(?:<string>|<stdin>)$/.test(frame.filename || "")
                ? snapshot
                : null;
          return sourceLink(target, frame);
        },
      });
    }
  };
}

module.exports = {
  captureSource,
  rangeFor,
  sourceLink,
  captureExecution,
  resolverForOutput: (output) => outputs.get(output)?.resolveTracebackFrame,
  renderOptionsForOutput: (output) => outputs.get(output) || {},
};
