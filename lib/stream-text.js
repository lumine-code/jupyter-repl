/**
 * Apply `text` to one line of terminal state, in place.
 *
 * A write lands at the cursor and advances it; `\r` returns the cursor to
 * column 0 without erasing anything. Holding a line as a buffer plus a column
 * is what lets a stream be applied one chunk at a time: the column is the state
 * a `\r` needs and a chunk boundary would otherwise lose.
 *
 * @param {{ buffer: string, cursor: number }} state - Mutated in place
 * @param {string} text - Carriage returns allowed, newlines are not
 */
function writeToLine(state, text) {
  let start = 0;

  for (;;) {
    const carriageReturn = text.indexOf("\r", start);
    const piece = carriageReturn === -1 ? text.slice(start) : text.slice(start, carriageReturn);

    if (piece) {
      state.buffer =
        state.buffer.slice(0, state.cursor) +
        piece +
        state.buffer.slice(state.cursor + piece.length);
      state.cursor += piece.length;
    }

    if (carriageReturn === -1) {
      return;
    }
    state.cursor = 0;
    start = carriageReturn + 1;
  }
}

/**
 * Resolve the carriage returns in `text`, as a terminal would.
 *
 * @param {string} text - Text with possible carriage returns
 * @returns {string} - The text each line was left showing
 */
function escapeCarriageReturn(text) {
  if (!text || typeof text !== "string" || !text.includes("\r")) {
    return text;
  }

  return text
    .split("\n")
    .map((line) => {
      if (!line.includes("\r")) {
        return line;
      }
      const state = { buffer: "", cursor: 0 };
      writeToLine(state, line);
      return state.buffer;
    })
    .join("\n");
}

module.exports = { escapeCarriageReturn, writeToLine };
