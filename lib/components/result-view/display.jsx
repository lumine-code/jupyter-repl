const { renderOutput } = require("../output");
const media = require("../output/media");
const { plotlyRenderer } = require("./plotly");
const { vegaRenderer } = require("./vega");
const { markdownRenderer } = require("./markdown");
const { htmlRenderer } = require("./html");
const { latexRenderer } = require("./latex");
const { widgetRenderer } = require("./widget");

/**
 * Every media type this package can render, mapped to the function that renders
 * it. Upstream expressed the same set as React children of a `RichMedia`
 * element and cloned the matching one; a table says it directly, and lets
 * `isTextOutputOnly` ask what is supported without walking a virtual tree.
 */
const MEDIA_RENDERERS = {
  "application/vnd.jupyter.widget-view+json": widgetRenderer,
  "application/vnd.vega.v5+json": vegaRenderer("application/vnd.vega.v5+json"),
  "application/vnd.vega.v4+json": vegaRenderer("application/vnd.vega.v4+json"),
  "application/vnd.vega.v3+json": vegaRenderer("application/vnd.vega.v3+json"),
  "application/vnd.vega.v2+json": vegaRenderer("application/vnd.vega.v2+json"),
  "application/vnd.vegalite.v5+json": vegaRenderer("application/vnd.vegalite.v5+json"),
  "application/vnd.vegalite.v4+json": vegaRenderer("application/vnd.vegalite.v4+json"),
  "application/vnd.vegalite.v3+json": vegaRenderer("application/vnd.vegalite.v3+json"),
  "application/vnd.vegalite.v2+json": vegaRenderer("application/vnd.vegalite.v2+json"),
  "application/vnd.vegalite.v1+json": vegaRenderer("application/vnd.vegalite.v1+json"),
  "application/vnd.plotly.v1+json": plotlyRenderer,
  "application/json": media.Json,
  "application/javascript": media.JavaScript,
  "text/html": htmlRenderer,
  "text/markdown": markdownRenderer,
  "text/latex": latexRenderer,
  "image/svg+xml": media.SVG,
  "image/gif": media.image("image/gif"),
  "image/jpeg": media.image("image/jpeg"),
  "image/png": media.image("image/png"),
  "text/plain": media.Plain,
};

const SUPPORTED_MEDIA_TYPES = Object.keys(MEDIA_RENDERERS);

/**
 * True when the only representation this package could render is plain text,
 * which is what lets a short result be shown inline rather than in a block.
 */
function isTextOutputOnly(data) {
  const bundleMediaTypes = Object.keys(data).filter((mediaType) =>
    SUPPORTED_MEDIA_TYPES.includes(mediaType),
  );
  return bundleMediaTypes.length === 1 && bundleMediaTypes[0] === "text/plain";
}

/** Render one output with the full media-type table. */
function renderDisplay(output) {
  return renderOutput(output, MEDIA_RENDERERS);
}

module.exports = {
  MEDIA_RENDERERS,
  SUPPORTED_MEDIA_TYPES,
  isTextOutputOnly,
  renderDisplay,
};
