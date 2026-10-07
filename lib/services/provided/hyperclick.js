const fs = require("node:fs/promises");
const path = require("node:path");
const runtimeSource = require("../../runtime-source");

const IDENTIFIER = "[_\\p{ID_Start}][_\\p{ID_Continue}]*";
const EXPRESSION = new RegExp(`(?:${IDENTIFIER}\\s*\\.\\s*)*${IDENTIFIER}$`, "u");
const point = (value) => ({ row: value.row ?? value[0], column: value.column ?? value[1] });

function expressionAt(editor, range) {
  const start = point(range.start ?? range[0]);
  const end = point(range.end ?? range[1]);
  if (start.row !== end.row) return null;
  const line = editor.lineTextForBufferRow(start.row);
  if (!line || /^\s*[!%?]/.test(line)) return null;
  const prefix = line.slice(0, end.column);
  const match = EXPRESSION.exec(prefix);
  if (!match || match.index > start.column || prefix.slice(0, match.index).trimEnd().endsWith("."))
    return null;
  // A live namespace cannot resolve a function's locals or a class body.
  // Leave those references to providers that know the lexical scope.
  let node = editor.getSyntaxNodeContainingBufferRange?.(range);
  const queried = node;
  while (node) {
    if (node.type === "attribute" && node.startPosition.row !== node.endPosition.row) return null;
    if (["function_definition", "class_definition", "lambda"].includes(node.type)) {
      const name = node.childForFieldName?.("name");
      if (
        !name ||
        !queried ||
        queried.startIndex < name.startIndex ||
        queried.endIndex > name.endIndex
      )
        return null;
    }
    node = node.parent;
  }
  return match[0].replace(/\s+/g, "");
}

function pythonEditor(editor) {
  return (
    !editor?.isDestroyed?.() &&
    /^source\.python(?:\.|$)/.test(editor?.getGrammar?.().scopeName || "")
  );
}

function ready(kernel) {
  return (
    kernel &&
    !kernel.isDestroyed() &&
    kernel.language === "python" &&
    kernel.executionState === "idle" &&
    kernel.connectionState === "ready"
  );
}

function sourceMatches(editor, source) {
  if (!source.source) return true;
  const expected = source.source.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const actual = editor
    .getText()
    .replace(/\r\n/g, "\n")
    .split("\n")
    .slice(source.line - 1, source.line - 1 + expected.length);
  if (source.sourceTruncated) return actual.join("\n").startsWith(expected.join("\n"));
  return (
    actual.length === expected.length && actual.every((line, index) => line === expected[index])
  );
}

function createHyperclickProvider({ getKernelForEditor, getAdapterServices, getIPythonSource }) {
  let disposed = false;
  const requests = new Set();
  const adapters = () => {
    const found = [];
    for (const item of lumine.workspace.getPaneItems()) {
      for (const service of getAdapterServices()) {
        const adapter = service.getAdapterForItem?.(item);
        if (adapter) found.push(adapter);
      }
    }
    return found;
  };
  const kernelFor = getKernelForEditor;
  const resolve = async (kernel, source, isCurrent) => {
    const frame = { ...source, sourceLine: source.source?.split(/\r?\n/)[0], isCurrent };
    for (const adapter of adapters()) {
      const link = adapter.resolveSourceFrame?.(frame, kernel);
      if (link) return link;
    }
    // Executing a notebook also captures its fragment editor in the ordinary
    // REPL path. Its adapter must reveal the cell before that fallback can
    // mistake the fragment for an independent workspace pane.
    const inline = require("../../traceback-context").resolveSourceFrame(kernel, frame);
    if (inline) return inline;
    // A cached IPython cell is not an ordinary file, even when its compiler
    // gives it a temporary .py path. Never substitute that file for its cell.
    if (
      source.executionCount != null ||
      !kernel.capabilities.localSource ||
      !path.isAbsolute(source.filename || "") ||
      /[\0\r\n]/.test(source.filename) ||
      !Number.isSafeInteger(source.line) ||
      source.line < 1
    )
      return null;
    try {
      if (!(await fs.stat(source.filename)).isFile()) return null;
    } catch {
      return null;
    }
    const opened = lumine.workspace
      .getTextEditors()
      .find((editor) => editor.getPath() === source.filename);
    if (opened && !sourceMatches(opened, source)) return null;
    return {
      async open() {
        if (!isCurrent()) return;
        const editor = await lumine.workspace.open(source.filename, { searchAllPanes: true });
        if (!isCurrent()) return;
        if (!editor?.setCursorBufferPosition || !sourceMatches(editor, source)) {
          lumine.notifications.addWarning(
            "The source changed. Run the code again before following its definition.",
          );
          return;
        }
        editor.setCursorBufferPosition([source.line - 1, 0]);
        editor.scrollToBufferPosition([source.line - 1, 0], { center: true });
        lumine.views.getView(editor)?.focus?.();
      },
    };
  };
  const lookup = async (editor, range, capture) => {
    if (disposed || !pythonEditor(editor)) return null;
    const kernel = kernelFor(editor);
    if (!ready(kernel)) return null;
    const sourceText = editor.getText();
    const grammar = editor.getGrammar();
    const generation = kernel.generation;
    const role = lumine.textEditors.roleFor?.(editor);
    let pythonSource = null;
    let projection = null;
    const current = () =>
      !disposed &&
      pythonEditor(editor) &&
      editor.getGrammar() === grammar &&
      editor.getText() === sourceText &&
      kernelFor(editor) === kernel &&
      kernel.generation === generation &&
      !kernel.isDestroyed() &&
      kernel.connectionState === "ready" &&
      lumine.textEditors.roleFor?.(editor) === role &&
      (!pythonSource || (getIPythonSource() === pythonSource && projection?.isCurrent()));
    if (capture && !capture()) return null;
    const controller = new AbortController();
    requests.add(controller);
    const closing = editor.onDidDestroy?.(() => controller.abort());
    try {
      await editor.getBuffer().getLanguageMode().atGrammarSettlement?.();
      if (!current() || controller.signal.aborted || !ready(kernel)) return null;
      const expression = expressionAt(editor, range);
      if (!expression) return null;
      if (
        grammar.scopeName === "source.python.ipy" &&
        lumine.textEditors.roleFor?.(editor) !== "fragment"
      ) {
        pythonSource = getIPythonSource();
        if (!pythonSource) return null;
        projection = await pythonSource.project(editor, { signal: controller.signal });
        if (
          !projection?.isCurrent() ||
          !projection.isPythonRange(range) ||
          getIPythonSource() !== pythonSource
        )
          return null;
      }
      if (!current()) return null;
      const source = await runtimeSource.queryRuntimeSource(kernel, expression, {
        signal: controller.signal,
        isCurrent: current,
      });
      if (!source || !current()) return null;
      const link = await resolve(kernel, { ...source, generation }, current);
      return link && current() ? { link, current, expression } : null;
    } catch {
      return null;
    } finally {
      closing?.dispose();
      requests.delete(controller);
    }
  };
  return {
    priority: 5,
    providerName: "jupyter-repl",
    disableForSelector:
      ".comment, .string, .constant.numeric, .keyword, .storage, .variable.parameter",
    async getSuggestionForWord(editor, _text, range) {
      const found = await lookup(editor, range);
      if (!found) return;
      return {
        range,
        async callback() {
          if (!found.current()) return;
          // Names can be rebound by another client, including a silent run.
          // Resolve again on click rather than reuse the hover's target.
          const fresh = await lookup(editor, range, found.current);
          if (fresh && found.current()) return fresh.link.open();
        },
      };
    },
    dispose() {
      disposed = true;
      for (const controller of requests) controller.abort();
      requests.clear();
    },
  };
}

module.exports = { createHyperclickProvider, expressionAt };
