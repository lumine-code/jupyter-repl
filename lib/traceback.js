const Anser = require("anser");

// Python and IPython publish traceback strings, not a standard structured MIME
// type. Keep the original text, and only recognize locations we can prove.
function locationFor(line) {
  let match = /^\s*Cell In\[(\d+)\], line (\d+)/.exec(line);
  if (match) return { executionCount: Number(match[1]), line: Number(match[2]) };
  match = /^\s*File "(.+)", line (\d+)(?:, in .*)?$/.exec(line);
  if (!match) match = /^\s*File (.+):(\d+)(?:, in .*)?$/.exec(line);
  if (!match) return null;
  const filename = match[1];
  const input = /^<ipython-input-(\d+)-[^>]+>$/.exec(filename);
  return {
    filename,
    line: Number(match[2]),
    ...(input ? { executionCount: Number(input[1]) } : {}),
  };
}

function parseTraceback(text, ename) {
  const lines = String(text || "").split(/\r?\n/);
  const parts = [];
  let part = { lines: [] };
  for (const rawLine of lines) {
    const plain = Anser.ansiToText(rawLine);
    const location = locationFor(plain);
    if (
      part.location &&
      (/^[\w.]+(?:Error|Exception|Warning):/.test(plain) ||
        /^During handling|^The above exception/.test(plain))
    ) {
      parts.push(part);
      part = { lines: [] };
    }
    if (location && Number.isSafeInteger(location.line) && location.line > 0) {
      if (part.lines.length) parts.push(part);
      part = { location, lines: [], library: isLibraryFrame(location.filename) };
    }
    part.lines.push(rawLine);
  }
  if (part.lines.length) parts.push(part);
  if (/^(?:SyntaxError|IndentationError|TabError)$/.test(ename)) {
    for (const frame of parts.filter((entry) => entry.location)) {
      const plainLines = frame.lines.map((line) => Anser.ansiToText(line));
      const caretIndex = plainLines.findIndex((line) => /^\s*[~^]*\^[~^]*\s*$/.test(line));
      if (caretIndex > 0) {
        // Python prints a four-space prefix before its source and underline.
        // The caret width is an end-exclusive range, not a whole-line error.
        const caret = plainLines[caretIndex];
        const source = plainLines[caretIndex - 1];
        if (source.startsWith("    ") && caret.startsWith("    ")) {
          frame.location.column = Math.max(0, caret.search(/[~^]/) - 4);
          frame.location.endColumn = frame.location.column + caret.trim().length;
          frame.location.sourceLine = source.slice(4);
        }
      }
    }
  }
  return parts;
}

function isLibraryFrame(filename) {
  return (
    typeof filename === "string" &&
    /(?:^|[\\/])(?:site-packages|dist-packages)(?:[\\/]|$)|[\\/]lib[\\/]python\d(?:\.\d+)?[\\/]|[\\/]Python\d+[\\/]Lib[\\/]/i.test(
      filename,
    )
  );
}

module.exports = { parseTraceback, locationFor, isLibraryFrame };
