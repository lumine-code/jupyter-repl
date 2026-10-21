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

exports.expression = (editor, { range }) => expressionAt(editor, range);
