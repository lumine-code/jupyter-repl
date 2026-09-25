const path = require("path");
const { pathToFileURL } = require("url");
const { escapeCarriageReturn, writeToLine } = require("./ansi-utils");

let htmlSanitizer = null;

// Valid output types from Jupyter messaging protocol
const OUTPUT_TYPES = ["execute_result", "display_data", "stream", "error"];

// Where each merged stream output is up to: the lines it has finished, and the
// one it is still writing. Held beside the output rather than on it, so nothing
// of this reaches the notebook format the outputs are serialized into.
//
// This exists because the text cannot be resolved a chunk at a time without it.
// Re-resolving the whole buffer per chunk — what this used to do — is quadratic:
// a 20,000-line print loop cost 13.5 seconds of blocked renderer to produce
// 200 KiB. Resolving each chunk on its own instead is not equivalent, because a
// `\r` writes relative to a column the previous chunk left the cursor at.
const streamState = new WeakMap();

function textOf(value) {
  if (typeof value === "string") {
    return value;
  }
  // The notebook format allows text to be an array of lines.
  return Array.isArray(value) ? value.join("") : "";
}

function writeStream(state, text) {
  let rest = text;

  for (let newline = rest.indexOf("\n"); newline !== -1; newline = rest.indexOf("\n")) {
    writeToLine(state.line, rest.slice(0, newline));
    // A line is settled once its newline arrives: nothing after it can write
    // back into it, so it is appended once and never looked at again.
    state.committed += state.line.buffer + "\n";
    state.line = { buffer: "", cursor: 0 };
    rest = rest.slice(newline + 1);
  }

  writeToLine(state.line, rest);
}

function streamStateFor(output) {
  const existing = streamState.get(output);
  if (existing) {
    return existing;
  }

  const state = { committed: "", line: { buffer: "", cursor: 0 } };
  streamState.set(output, state);
  // Whatever text the output already carries is the stream so far, whether it
  // came from a kernel message, a notebook, or the first chunk of this run.
  writeStream(state, textOf(output.text));
  output.text = state.line.buffer ? state.committed + state.line.buffer : state.committed;
  return state;
}

function appendText(previous, next) {
  const state = streamStateFor(previous);
  writeStream(state, textOf(next.text));
  previous.text = state.line.buffer ? state.committed + state.line.buffer : state.committed;
}

/**
 * Resolve a stream output's carriage returns and start tracking it, so a
 * single-chunk output reads the same as one that arrived in pieces.
 *
 * @param {Object} output - A stream output, mutated in place
 */
function normalizeStreamOutput(output) {
  if (output && output.output_type === "stream") {
    streamStateFor(output);
  }
  return output;
}

/**
 * Reduce/aggregate output messages, merging consecutive stream outputs.
 * This handles the case where output arrives incrementally over time.
 *
 * Based on: https://github.com/nteract/jupyter-repl/issues/466#issuecomment-274822937
 *
 * @param {Object[]} outputs - Existing kernel output messages
 * @param {Object} output - New output to be added
 * @returns {Object[]} - Updated outputs array
 */
function reduceOutputs(outputs, output) {
  const last = outputs.length - 1;

  if (
    outputs.length > 0 &&
    output.output_type === "stream" &&
    outputs[last].output_type === "stream"
  ) {
    // Merge with last output if same stream name
    if (outputs[last].name === output.name) {
      appendText(outputs[last], output);
      return outputs;
    }

    // Or merge with second-to-last if interleaved stdout/stderr
    if (outputs.length > 1 && outputs[last - 1].name === output.name) {
      appendText(outputs[last - 1], output);
      return outputs;
    }
  }

  normalizeStreamOutput(output);
  outputs.push(output);
  return outputs;
}

/**
 * Normalize output to ensure all text fields are strings, not arrays.
 * The Jupyter notebook format allows text to be arrays of strings,
 * but rendering libraries expect strings.
 *
 * @param {Object} output - Jupyter output message
 * @returns {Object} - Normalized output with string text fields
 */
function normalizeOutput(output) {
  if (!output) return output;

  const normalized = { ...output };

  // Normalize stream text
  if (normalized.text !== undefined) {
    normalized.text = Array.isArray(normalized.text)
      ? normalized.text.join("")
      : typeof normalized.text === "string"
        ? normalized.text
        : String(normalized.text || "");
  }

  // Normalize data fields in execute_result and display_data
  if (normalized.data) {
    normalized.data = { ...normalized.data };
    for (const [mimeType, content] of Object.entries(normalized.data)) {
      if (Array.isArray(content)) {
        normalized.data[mimeType] = content.join("");
      } else if (content !== null && typeof content !== "string" && typeof content !== "object") {
        // Convert non-string primitives to string (except objects which might be JSON)
        normalized.data[mimeType] = String(content);
      }
    }
  }

  // Normalize traceback in error outputs
  if (normalized.traceback) {
    // Ensure each traceback line is a string
    normalized.traceback = normalized.traceback.map((line) =>
      Array.isArray(line) ? line.join("") : typeof line === "string" ? line : String(line || ""),
    );
  }

  return normalized;
}

/**
 * Convert Jupyter message spec to notebook format.
 * Creates an object that adheres to the Jupyter notebook specification.
 * http://jupyter-client.readthedocs.io/en/latest/messaging.html
 *
 * @param {Object} message - Message that has content which can be converted to nbformat
 * @returns {Object} - Message with the associated output type
 */
function msgSpecToNotebookFormat(message) {
  return Object.assign({}, message.content, {
    output_type: message.header.msg_type,
  });
}

/**
 * Check if output contains only plain text (no rich content).
 *
 * @param {Object} data - Output data bundle
 * @param {Array} supportedMediaTypes - List of supported media types
 * @returns {boolean} - True if only text/plain is present
 */
function isTextOutputOnly(data, supportedMediaTypes = null) {
  if (!data) return true;

  const mediaTypes = Object.keys(data);
  if (mediaTypes.length === 0) return true;
  if (mediaTypes.length === 1 && mediaTypes[0] === "text/plain") return true;

  // If we have supported types list, check if only text/plain is supported
  if (supportedMediaTypes) {
    const supported = mediaTypes.filter((mt) => supportedMediaTypes.includes(mt));
    return supported.length === 1 && supported[0] === "text/plain";
  }

  return false;
}

/**
 * Check if text is a single line that fits in available space.
 *
 * @param {string} text - Text to check
 * @param {number} availableSpace - Available characters
 * @returns {boolean} - True if text is single line and fits
 */
function isSingleLine(text, availableSpace) {
  if (!text) return true;

  // A newline anywhere but the very end settles it, and that is the common
  // case — so answer it before resolving carriage returns, which walks the
  // whole string. This is read once per frame per result while output streams.
  const newline = text.indexOf("\n");
  if (newline !== -1 && newline !== text.length - 1) {
    return false;
  }

  return availableSpace > escapeCarriageReturn(text).length;
}

/**
 * Get plain text representation of outputs.
 *
 * @param {Object[]} outputs - Array of output messages
 * @returns {string} - Plain text content
 */
function getOutputPlainText(outputs) {
  if (!outputs || outputs.length === 0) return "";

  const texts = [];

  outputs.forEach((output) => {
    if (output.output_type === "stream") {
      texts.push(output.text || "");
    } else if (output.output_type === "execute_result" || output.output_type === "display_data") {
      if (output.data && output.data["text/plain"]) {
        const text = output.data["text/plain"];
        texts.push(Array.isArray(text) ? text.join("") : text);
      }
    } else if (output.output_type === "error") {
      if (output.traceback) {
        texts.push(output.traceback.join("\n"));
      } else {
        texts.push(`${output.ename}: ${output.evalue}`);
      }
    }
  });

  return texts.join("\n");
}

/**
 * Sanitize HTML to remove potentially dangerous content.
 *
 * @param {string} html - HTML content
 * @returns {string} - Sanitized HTML
 */
function normalizeImageSource(source) {
  if (typeof source !== "string" || !path.isAbsolute(source) || /^\/\//.test(source)) {
    return source;
  }
  try {
    return pathToFileURL(source).href;
  } catch {
    // Leave malformed paths to the scheme filter below; it will remove them.
    return source;
  }
}

function normalizeMediaTag(tagName, attribs) {
  const attributes = { ...attribs };
  for (const name of ["src", "poster"]) {
    if (attributes[name]) {
      attributes[name] = normalizeImageSource(attributes[name]);
    }
  }
  return { tagName, attribs: attributes };
}

function isRemoteFrameSource(source) {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";

  // Keep the package cheap to activate: HTML output is uncommon, and the
  // sanitizer is needed only once such an output actually renders.
  htmlSanitizer ||= require("sanitize-html");

  return htmlSanitizer(html, {
    allowedTags: [
      ...htmlSanitizer.defaults.allowedTags,
      "audio",
      "details",
      "iframe",
      "img",
      "picture",
      "source",
      "summary",
      "track",
      "video",
    ],
    allowedAttributes: {
      "*": ["class", "title", "role", "aria-*", "data-*"],
      a: ["href", "name", "target", "rel"],
      audio: ["src", "controls", "autoplay", "loop", "muted", "preload", "crossorigin"],
      col: ["span"],
      details: ["open"],
      iframe: [
        "src",
        "width",
        "height",
        "frameborder",
        "allowfullscreen",
        "loading",
        "referrerpolicy",
        "sandbox",
      ],
      img: ["src", "alt", "title", "width", "height", "loading"],
      li: ["value"],
      ol: ["start", "reversed", "type"],
      source: ["src", "type", "media"],
      td: ["colspan", "rowspan", "headers"],
      th: ["colspan", "rowspan", "headers", "scope"],
      track: ["src", "kind", "srclang", "label", "default"],
      video: [
        "src",
        "controls",
        "autoplay",
        "loop",
        "muted",
        "preload",
        "crossorigin",
        "poster",
        "width",
        "height",
        "playsinline",
      ],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: {
      audio: ["blob", "data", "file", "http", "https"],
      iframe: ["http", "https"],
      img: ["blob", "data", "file", "http", "https"],
      source: ["blob", "data", "file", "http", "https"],
      track: ["blob", "data", "file", "http", "https"],
      video: ["blob", "data", "file", "http", "https"],
    },
    transformTags: {
      a(tagName, attribs) {
        const attributes = { ...attribs };
        if (attributes.target === "_blank") {
          attributes.rel = "noopener noreferrer";
        } else if (attributes.target && attributes.target !== "_self") {
          delete attributes.target;
        }
        return { tagName, attribs: attributes };
      },
      audio: normalizeMediaTag,
      iframe(tagName, attribs) {
        return {
          tagName,
          attribs: {
            ...attribs,
            sandbox: "allow-scripts allow-same-origin",
            referrerpolicy: "no-referrer",
          },
        };
      },
      img: normalizeMediaTag,
      source: normalizeMediaTag,
      track: normalizeMediaTag,
      video: normalizeMediaTag,
    },
    exclusiveFilter(frame) {
      return frame.tag === "iframe" && !isRemoteFrameSource(frame.attribs.src);
    },
  });
}

module.exports = {
  OUTPUT_TYPES,
  reduceOutputs,
  normalizeStreamOutput,
  normalizeOutput,
  msgSpecToNotebookFormat,
  isTextOutputOnly,
  isSingleLine,
  getOutputPlainText,
  isRemoteFrameSource,
  normalizeImageSource,
  sanitizeHtml,
};
