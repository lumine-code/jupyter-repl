/** @jsx etch.dom */
const etch = require("@lumine-code/etch"); // JSX factory
const { ansiNodes, truncateOutput } = require("../../ansi-utils");

// Replaces @nteract/outputs. The upstream shape configured the renderers by
// passing them as React children and cloning the matching one; here the caller
// hands in a media-type table and these functions pick from it, which is the
// same choice expressed as data.

/**
 * Media types in the order they are preferred when an output carries several
 * representations of the same value.
 */
const MIME_PRIORITY = [
  // ipywidgets. A live view of a kernel-side object, and the only entry that
  // can decline: without a manager there is nothing to render, and the repr the
  // kernel sent in the same bundle is what a stored notebook should show. Above
  // the plot formats too — a figure widget emits one precisely because it wants
  // to be driven from Python, and the static spec is the degraded form.
  "application/vnd.jupyter.widget-view+json",
  // Vega/Vega-Lite (interactive visualizations)
  "application/vnd.vega.v5+json",
  "application/vnd.vega.v4+json",
  "application/vnd.vega.v3+json",
  "application/vnd.vega.v2+json",
  "application/vnd.vegalite.v5+json",
  "application/vnd.vegalite.v4+json",
  "application/vnd.vegalite.v3+json",
  "application/vnd.vegalite.v2+json",
  "application/vnd.vegalite.v1+json",
  // Plotly
  "application/vnd.plotly.v1+json",
  // Rich formats
  "text/html",
  "text/markdown",
  "text/latex",
  "image/svg+xml",
  // Images
  "image/png",
  "image/jpeg",
  "image/gif",
  // Structured data
  "application/json",
  "application/javascript",
  // Plain text (fallback)
  "text/plain",
];

const PRIORITIZED_MEDIA_TYPES = new Set(MIME_PRIORITY);

/**
 * Render the best available representation of a MIME bundle.
 *
 * A renderer that returns nothing has declined, and the next representation is
 * tried instead. That is what lets a media type sit high in the priority list
 * without having to render every bundle that carries it: the live form of a
 * value is always preferable, but only when it can actually be produced, and
 * the kernel virtually always sends a plain-text repr alongside.
 *
 * @param {Object} data - The MIME bundle, keyed by media type
 * @param {Object} metadata - Per-media-type metadata from the same output
 * @param {Object} renderers - Media type to `(data, metadata, bundle) => vnode|null`
 * @returns {*} Virtual nodes, or null when nothing in the bundle can be rendered
 */
function renderRichMedia(data, metadata, renderers) {
  if (!data || typeof data !== "object") {
    return null;
  }

  // The whole bundle is passed alongside the matched representation, so a
  // renderer that can only partly represent its own media type can fall back
  // to what the kernel sent with it rather than showing a bare error.
  const render = (mediaType) =>
    renderers[mediaType](data[mediaType], metadata && metadata[mediaType], data);

  for (const mediaType of MIME_PRIORITY) {
    if (data[mediaType] !== undefined && renderers[mediaType]) {
      const vnode = render(mediaType);
      if (vnode != null) {
        return vnode;
      }
    }
  }

  // A bundle may carry a supported type that is not in the priority list.
  // Anything the loop above already offered is skipped rather than declined a
  // second time.
  for (const mediaType of Object.keys(data)) {
    if (renderers[mediaType] && !PRIORITIZED_MEDIA_TYPES.has(mediaType)) {
      const vnode = render(mediaType);
      if (vnode != null) {
        return vnode;
      }
    }
  }

  return null;
}

/** stdout / stderr, with ANSI colour support. */
function renderStreamText(output) {
  const { text: rawText, name } = output;
  if (!rawText) {
    return null;
  }

  const { text, truncated } = truncateOutput(rawText);

  return (
    <div>
      <pre className={`output-stream output-${name || "stdout"}`}>{ansiNodes(text)}</pre>
      {truncated ? <div className="output-truncated">... output truncated</div> : null}
    </div>
  );
}

/** An error, as name, value and traceback. */
function renderError(output) {
  const { ename, evalue, traceback } = output;

  const rawTraceback = Array.isArray(traceback) ? traceback.join("\n") : "";
  const { text: truncatedTraceback, truncated } = truncateOutput(rawTraceback);

  // The traceback already ends with the error, so the header would repeat it.
  const showHeader = !truncatedTraceback;

  return (
    <div className="output-error">
      {showHeader ? (
        <div className="error-header">
          <span className="error-name">{ename}</span>
          {evalue ? <span className="error-value">: {ansiNodes(evalue)}</span> : null}
        </div>
      ) : null}
      {truncatedTraceback ? (
        <pre className="error-traceback">{ansiNodes(truncatedTraceback)}</pre>
      ) : null}
      {truncated ? <div className="output-truncated">... traceback truncated</div> : null}
    </div>
  );
}

/**
 * Render one Jupyter output, choosing by its `output_type`.
 *
 * @param {Object} output - A single output in notebook format
 * @param {Object} renderers - Media type table for the rich output types
 * @returns {*} Virtual nodes, or null for an output type with nothing to show
 */
function renderOutput(output, renderers) {
  if (!output || !output.output_type) {
    return null;
  }

  switch (output.output_type) {
    case "execute_result":
    case "display_data":
      return output.data ? renderRichMedia(output.data, output.metadata, renderers) : null;

    case "stream":
      return renderStreamText(output);

    case "error":
      return renderError(output);

    default:
      return null;
  }
}

module.exports = { renderOutput, renderRichMedia, renderStreamText, renderError, MIME_PRIORITY };
