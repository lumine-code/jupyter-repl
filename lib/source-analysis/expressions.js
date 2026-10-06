const { getSelectedText, getRow } = require("./editor-text");

function isExpressionChar(char) {
  return typeof char === "string" && char.length === 1 && /[\w$.\u00A0-\uFFFF]/.test(char);
}

function isIdentifierStartChar(char) {
  return (
    typeof char === "string" &&
    char.length === 1 &&
    (/[$A-Z_a-z\u00A0-\uFFFF]/.test(char) || char === "_")
  );
}

function stripOuterParentheses(text) {
  let result = text.trim();

  while (result.startsWith("(") && result.endsWith(")")) {
    let depth = 0;
    let wrapsExpression = true;

    for (let i = 0; i < result.length; i++) {
      const char = result[i];
      if (char === "(") depth++;
      if (char === ")") depth--;

      if (depth === 0 && i < result.length - 1) {
        wrapsExpression = false;
        break;
      }
      if (depth < 0) {
        wrapsExpression = false;
        break;
      }
    }

    if (!wrapsExpression || depth !== 0) {
      break;
    }

    result = result.slice(1, -1).trim();
  }

  return result;
}

function normalizePanelExpression(text) {
  let expression = stripOuterParentheses(text || "");
  const emptyCall = expression.match(/^([\w$.\u00A0-\uFFFF]+)\(\s*\)$/);
  if (emptyCall) {
    expression = emptyCall[1];
  }
  return expression.trim();
}

function getMatchingCloseParen(line, openIndex) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let i = openIndex; i < line.length; i++) {
    const char = line[i];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === "(") depth++;
    if (char === ")") {
      depth--;
      if (depth === 0) {
        return i;
      }
      if (depth < 0) {
        return -1;
      }
    }
  }

  return -1;
}

function getCallExpressionAtArgumentCursor(line, cursorPosition) {
  for (let open = cursorPosition - 1; open >= 0; open--) {
    if (line[open] !== "(") {
      continue;
    }

    const close = getMatchingCloseParen(line, open);
    if (close === -1 || close < cursorPosition) {
      continue;
    }
    if (line.slice(open + 1, close).trim() === "") {
      continue;
    }

    let calleeEnd = open;
    while (calleeEnd > 0 && /\s/.test(line[calleeEnd - 1])) {
      calleeEnd--;
    }
    if (!isExpressionChar(line[calleeEnd - 1])) {
      continue;
    }

    let calleeStart = calleeEnd;
    while (calleeStart > 0 && isExpressionChar(line[calleeStart - 1])) {
      calleeStart--;
    }

    return {
      expression: line.slice(calleeStart, close + 1).trim(),
      cursorPosition: cursorPosition - calleeStart,
    };
  }

  return null;
}

function getSymbolExpressionAtCursor(line, cursorPosition) {
  let end = cursorPosition;

  if (isExpressionChar(line[end])) {
    while (end < line.length && isExpressionChar(line[end])) {
      end++;
    }
  } else if (!isExpressionChar(line[end - 1])) {
    return null;
  }

  let start = end;
  while (start > 0 && isExpressionChar(line[start - 1])) {
    start--;
  }

  const expression = normalizePanelExpression(line.slice(start, end).replace(/^\.+|\.+$/g, ""));
  if (!expression || !isIdentifierStartChar(expression[0])) {
    return null;
  }

  return {
    expression,
    cursorPosition: expression.length,
  };
}

function getExpressionFromLineAtCursor(line, cursorPosition) {
  if (!line) {
    return { expression: "", cursorPosition: 0 };
  }

  let cursor = Math.max(0, Math.min(cursorPosition, line.length));
  const symbolExpression = getSymbolExpressionAtCursor(line, cursor);
  if (symbolExpression) {
    return symbolExpression;
  }

  const callExpression = getCallExpressionAtArgumentCursor(line, cursor);
  if (callExpression) {
    return callExpression;
  }

  let end = cursor;

  if (line[end] === "(" && end > 0 && isExpressionChar(line[end - 1])) {
    // Cursor is on an empty-call open paren: obj.method(|) -> obj.method.
  } else if (end > 0 && line[end - 1] === "(" && isExpressionChar(line[end - 2])) {
    end--;
  } else if (end > 0 && line[end - 1] === ")") {
    let close = end - 1;
    while (close > 0 && /\s/.test(line[close - 1])) {
      close--;
    }
    const open = line.lastIndexOf("(", close - 1);
    if (open !== -1 && line.slice(open + 1, close).trim() === "") {
      end = open;
    }
  } else {
    while (end < line.length && isExpressionChar(line[end])) {
      end++;
    }
  }

  let start = end;
  while (start > 0 && isExpressionChar(line[start - 1])) {
    start--;
  }

  const expression = normalizePanelExpression(line.slice(start, end).replace(/^\.+|\.+$/g, ""));
  return {
    expression,
    cursorPosition: expression.length,
  };
}

function getExpressionInfoAtCursor(editor) {
  const selectedText = getSelectedText(editor);
  if (selectedText) {
    const expression = normalizePanelExpression(selectedText);
    return {
      expression,
      cursorPosition: expression.length,
    };
  }

  const cursor = editor.getLastCursor();
  return getExpressionFromLineAtCursor(
    getRow(editor, cursor.getBufferRow()),
    cursor.getBufferColumn(),
  );
}

function getExpressionAtCursor(editor) {
  return getExpressionInfoAtCursor(editor).expression;
}

module.exports = { getExpressionInfoAtCursor, getExpressionAtCursor };
