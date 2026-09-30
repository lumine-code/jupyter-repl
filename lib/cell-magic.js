const { Range } = require("lumine");

function headerAt(editor, range = editor.getBuffer().getRange()) {
  const last = range.end.row;
  let row = range.start.row;
  let line = editor.lineTextForBufferRow(row);
  while (row < last && !line.trim()) line = editor.lineTextForBufferRow(++row);
  const match = /^[ \t]*%%([A-Za-z_][A-Za-z0-9_]*|!)(?:[ \t]+.*)?$/.exec(line);
  return match
    ? { row, header: line, bodyStart: editor.getBuffer().clipPosition([row + 1, 0]) }
    : null;
}

function selectionBlock(editor, selection) {
  const magic = headerAt(editor);
  if (!magic) return null;
  const buffer = editor.getBuffer();
  if (selection.isEmpty()) {
    return { code: editor.getText(), row: lastRow(buffer.getRange()), range: buffer.getRange() };
  }
  const selected = selection.getBufferRange();
  const body =
    intersectRanges(selected, new Range(magic.bodyStart, buffer.getEndPosition())) ||
    new Range(magic.bodyStart, magic.bodyStart);
  return {
    code: `${magic.header}\n${editor.getTextInBufferRange(body)}`,
    row: body.isEmpty() ? magic.row : lastRow(body),
    range: body,
  };
}

function lastRow(range) {
  return Math.max(
    range.start.row,
    range.end.row - (range.end.column === 0 && range.end.row > range.start.row ? 1 : 0),
  );
}

function intersectRanges(left, right) {
  const start = left.start.isGreaterThan(right.start) ? left.start : right.start;
  const end = left.end.isLessThan(right.end) ? left.end : right.end;
  return start.isGreaterThan(end) ? null : new Range(start, end);
}

module.exports = { headerAt, selectionBlock, lastRow, intersectRanges };
