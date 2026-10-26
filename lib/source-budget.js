const { constants } = require("node:buffer");

const DEFAULT_SOURCE_UNITS = 32 * 1024 * 1024;
const MAX_SOURCE_UNITS = Math.floor((constants.MAX_STRING_LENGTH - 65536) / 6);

function sourceLimit() {
  const configured = globalThis.lumine?.config?.get("jupyter-repl.maxExecutionSize");
  return Math.min(
    MAX_SOURCE_UNITS,
    Number.isFinite(configured) && configured > 0 ? configured * 1024 * 1024 : DEFAULT_SOURCE_UNITS,
  );
}

function assertLength(length, limit = sourceLimit()) {
  if (length > limit)
    throw Object.assign(
      new RangeError(
        `Execution source exceeds the ${Math.floor(limit / 1024 / 1024)} Mi UTF-16 limit. Select a smaller block or increase jupyter-repl.maxExecutionSize.`,
      ),
      {
        code: "ERR_JUPYTER_SOURCE_LIMIT",
        length,
        limit,
      },
    );
}

function readLine(editor, row) {
  const length = editor.getBuffer().lineLengthForRow(row);
  if (length === undefined) return undefined;
  assertLength(length);
  return editor.lineTextForBufferRow(row);
}

function assertRange(editor, range) {
  const buffer = editor.getBuffer();
  const start = buffer.clipPosition(range.start ?? range[0]);
  const end = buffer.clipPosition(range.end ?? range[1]);
  assertLength(
    Math.abs(buffer.characterIndexForPosition(end) - buffer.characterIndexForPosition(start)),
  );
  return [start, end];
}

function readRange(editor, range) {
  return editor.getTextInBufferRange(assertRange(editor, range));
}

function serializeMessage(value, budget = {}) {
  budget.units ??= 0;
  budget.limit ??= Math.min(constants.MAX_STRING_LENGTH, sourceLimit() * 6 + 65536);
  return JSON.stringify(value, (key, item) => {
    budget.units += 32 + key.length * 6 + (typeof item === "string" ? item.length * 6 : 0);
    if (budget.units > budget.limit)
      throw Object.assign(new RangeError("Jupyter message exceeds the JSON transport budget."), {
        code: "ERR_JUPYTER_MESSAGE_LIMIT",
      });
    return item;
  });
}

function assertIncomingFrames(frames) {
  const limit = Math.min(constants.MAX_STRING_LENGTH, sourceLimit() * 6 + 65536);
  const length = frames.reduce((sum, frame) => sum + (frame?.byteLength ?? 0), 0);
  if (length > limit)
    throw Object.assign(
      new RangeError("Incoming Jupyter JSON frames exceed the transport budget."),
      {
        code: "ERR_JUPYTER_MESSAGE_LIMIT",
        length,
        limit,
      },
    );
}

module.exports = {
  sourceLimit,
  assertLength,
  assertRange,
  readLine,
  readRange,
  serializeMessage,
  assertIncomingFrames,
};
