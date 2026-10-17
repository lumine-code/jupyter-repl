/** @jsx etch.dom */
const etch = require("@lumine-code/etch"); // JSX factory
const Anser = require("anser");
const { escapeCarriageReturn, writeToLine } = require("./stream-text");

/**
 * Truncate text to prevent crashes from large outputs.
 *
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length (default: from config, 0 = no limit)
 * @returns {{ text: string, truncated: boolean }} - Truncated text and flag
 */
function truncateOutput(text, maxLength) {
  if (!text || typeof text !== "string") {
    return { text: text || "", truncated: false };
  }
  // Read the setting here rather than as a default argument, which evaluated it
  // even on the return above.
  const limit =
    maxLength === undefined ? lumine.config.get("jupyter-repl.outputMaxLength") : maxLength;
  // 0, undefined, null, or negative means no limit
  if (!limit || limit <= 0 || text.length <= limit) {
    return { text, truncated: false };
  }
  return {
    text: text.slice(0, limit),
    truncated: true,
  };
}

// The first sixteen ANSI colors belong to the active terminal palette. Explicit
// RGB and extended indexed colors belong to the output and keep their values.
function ansiColor(name, trueColor) {
  if (!name) return null;
  if (name === "ansi-truecolor") return `rgb(${trueColor})`;
  const indexed = /^ansi-palette-(\d+)$/.exec(name);
  if (indexed) {
    const index = Number(indexed[1]);
    if (index >= 232) {
      const channel = 8 + (index - 232) * 10;
      return `rgb(${channel}, ${channel}, ${channel})`;
    }
    const value = index - 16;
    const levels = [0, 95, 135, 175, 215, 255];
    return `rgb(${levels[Math.floor(value / 36)]}, ${levels[Math.floor(value / 6) % 6]}, ${levels[value % 6]})`;
  }
  return `var(--terminal-color-${name.slice("ansi-".length)})`;
}

/**
 * Render text containing ANSI escape sequences as etch virtual nodes.
 *
 * A plain function rather than a component: etch calls a function tag with
 * `new`, so only classes can be tags, and there is no state to keep here.
 *
 * @param {string} text - Text containing ANSI escape sequences
 * @returns {Array} - Virtual nodes for the coloured runs
 */
function ansiNodes(text) {
  if (!text || typeof text !== "string") {
    return [];
  }

  const parsed = Anser.ansiToJson(text, { remove_empty: true, use_classes: true });

  return parsed.map((part) => {
    const { content, fg, bg, decoration } = part;
    if (!content) return null;

    const style = {};
    let fgValue = ansiColor(fg, part.fg_truecolor);
    const bgValue = ansiColor(bg, part.bg_truecolor);

    // Fix matching foreground/background colors
    if (fgValue && bgValue && fgValue === bgValue) {
      fgValue = `lch(from ${bgValue} calc((49.44 - l) * infinity) 0 0)`;
    }

    if (fgValue) style.color = fgValue;
    if (bgValue) style.backgroundColor = bgValue;
    if (decoration === "bold") style.fontWeight = "bold";
    else if (decoration === "italic") style.fontStyle = "italic";
    else if (decoration === "underline") style.textDecoration = "underline";

    if (Object.keys(style).length > 0) {
      return <span style={style}>{content}</span>;
    }
    return content;
  });
}

module.exports = { truncateOutput, ansiNodes, escapeCarriageReturn, writeToLine };
