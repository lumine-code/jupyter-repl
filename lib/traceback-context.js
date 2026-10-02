const outputs = new WeakMap();
const kernels = new WeakMap();

function kernelState(kernel) {
  let state = kernels.get(kernel);
  const transport = kernel.transport || null;
  const generation = transport?._connectionGeneration ?? null;
  if (!state) {
    state = { transport, generation, epoch: 0, counts: new Map(), subscription: null };
    kernels.set(kernel, state);
  } else if (state.transport !== transport || state.generation !== generation) {
    state.counts = new Map();
    state.epoch++;
    state.generation = generation;
    if (state.transport !== transport) {
      state.subscription?.dispose();
      state.subscription = null;
      state.transport = transport;
    }
  }
  if (!state.subscription && kernel.onDidChangeExecutionState) {
    state.subscription = kernel.onDidChangeExecutionState((status) => {
      if (["restarting", "autorestarting", "shutting-down", "dead"].includes(status)) {
        state.counts = new Map();
        state.epoch++;
      }
    });
  }
  return state;
}

function sourceFrame(frame) {
  if (!frame || !Number.isInteger(frame.line) || frame.line < 1) return null;
  const input = /^<ipython-input-(\d+)-[^>]+>$/.exec(frame.filename || "");
  const executionCount = frame.executionCount ?? (input ? Number(input[1]) : null);
  if (!Number.isSafeInteger(executionCount) || executionCount < 1) return null;
  if (input && Number(input[1]) !== executionCount) return null;
  const firstLine =
    typeof frame.source === "string" && frame.source
      ? frame.source.split(/\r?\n/)[0]
      : frame.sourceLine;
  if (firstLine != null && typeof firstLine !== "string") return null;
  return { ...frame, executionCount, ...(firstLine != null ? { sourceLine: firstLine } : {}) };
}

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

function sourceLink(snapshot, frame, reveal, options = {}) {
  if (options.isCurrent && !options.isCurrent()) return null;
  const range = rangeFor(snapshot, frame);
  if (!range) return null;
  return {
    title: options.title || "Go to the source of this execution",
    async open() {
      const current = rangeFor(snapshot, frame);
      if (!current || (options.isCurrent && !options.isCurrent())) {
        lumine.notifications.addWarning(
          options.staleMessage ||
            "The source changed since this execution. Run it again to update traceback links.",
        );
        return;
      }
      reveal?.();
      await lumine.workspace.open(snapshot.editor, { searchAllPanes: true });
      const afterOpen = rangeFor(snapshot, frame);
      if (!afterOpen || (options.isCurrent && !options.isCurrent())) return;
      snapshot.editor.setSelectedBufferRange(afterOpen);
      snapshot.editor.scrollToBufferPosition(afterOpen[0], { center: true });
      lumine.views.getView(snapshot.editor)?.focus?.();
    },
  };
}

function captureExecution(editor, kernel, code, row) {
  const counts = kernelState(kernel).counts;
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

function resolveSourceFrame(kernel, frame) {
  if (!kernel || (typeof kernel !== "object" && typeof kernel !== "function")) return null;
  if (kernel._destroyed || kernel.destroyed || kernel.transport?._destroyed) return null;
  const location = sourceFrame(frame);
  if (!location || !kernels.has(kernel)) return null;
  const state = kernelState(kernel);
  const snapshot = state.counts.get(location.executionCount);
  // Only the notebook adapter can reveal an embedded cell. Older adapters
  // without runtime navigation must fall back instead of opening a fragment.
  if (snapshot?.editor && lumine.textEditors.roleFor?.(snapshot.editor) === "fragment") return null;
  const epoch = state.epoch;
  const transport = state.transport;
  const generation = state.generation;
  const isCurrent = () => {
    if (snapshot?.editor && lumine.textEditors.roleFor?.(snapshot.editor) === "fragment")
      return false;
    if (typeof frame.isCurrent === "function" && !frame.isCurrent()) return false;
    if (kernel._destroyed || kernel.destroyed || kernel.transport?._destroyed) return false;
    const current = kernelState(kernel);
    const lifecycle = kernel.transport?.lifecycle ?? kernel.executionState;
    return (
      !kernel._destroyed &&
      !kernel.destroyed &&
      !kernel.transport?._destroyed &&
      !["loading", "recovering", "unresponsive", "restarting", "shutting-down", "dead"].includes(
        lifecycle,
      ) &&
      current.transport === transport &&
      current.generation === generation &&
      current.epoch === epoch &&
      current.counts.get(location.executionCount) === snapshot &&
      (frame.generation == null || frame.generation === generation)
    );
  };
  return sourceLink(snapshot, location, null, {
    isCurrent,
    title: "Go to the executed source of this definition",
    staleMessage: "The source or kernel changed. Request the definition again.",
  });
}

module.exports = {
  captureSource,
  rangeFor,
  sourceLink,
  captureExecution,
  resolveSourceFrame,
  resolverForOutput: (output) => outputs.get(output)?.resolveTracebackFrame,
  renderOptionsForOutput: (output) => outputs.get(output) || {},
};
