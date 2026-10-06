const { renderOutput } = require("../output");
const { renderOptionsForOutput } = require("../../traceback-context");
const media = require("../output/media");
const { plotlyRenderer, plotlyHtmlRenderer } = require("./plotly");
const { vegaRenderer } = require("./vega");
const { markdownRenderer } = require("./markdown");
const { htmlRenderer } = require("./html");
const { latexRenderer } = require("./latex");
const { widgetRenderer } = require("./widget");
const { bokehRenderer, BOKEH_LOAD, BOKEH_EXEC, PANEL_LOAD, PANEL_EXEC } = require("./bokeh");
const { SUPPORTED_MEDIA_TYPES, VEGA_MEDIA_TYPES, isTextOutputOnly } = require("../../output-media");

/**
 * Every media type this package can render, mapped to the function that renders
 * it. Upstream expressed the same set as React children of a `RichMedia`
 * element and cloned the matching one; a table says it directly, and lets
 * `isTextOutputOnly` ask what is supported without walking a virtual tree.
 */
const MEDIA_RENDERERS = {
  "application/vnd.jupyter.widget-view+json": widgetRenderer,
  [BOKEH_LOAD]: bokehRenderer(BOKEH_LOAD),
  [BOKEH_EXEC]: bokehRenderer(BOKEH_EXEC),
  [PANEL_LOAD]: bokehRenderer(PANEL_LOAD),
  [PANEL_EXEC]: bokehRenderer(PANEL_EXEC),
  ...Object.fromEntries(Object.keys(VEGA_MEDIA_TYPES).map((type) => [type, vegaRenderer(type)])),
  "application/vnd.plotly.v1+json": plotlyRenderer,
  "text/vnd.plotly.v1+html": plotlyHtmlRenderer,
  "application/json": media.Json,
  "application/javascript": media.JavaScript,
  "text/html": htmlRenderer,
  "text/markdown": markdownRenderer,
  "text/latex": latexRenderer,
  "image/svg+xml": media.SVG,
  "image/webp": media.image("image/webp"),
  "image/gif": media.image("image/gif"),
  "image/jpeg": media.image("image/jpeg"),
  "image/png": media.image("image/png"),
  "text/plain": media.Plain,
};

/** Render one output with the full media-type table. */
function renderDisplay(output, options) {
  return renderOutput(output, MEDIA_RENDERERS, { ...renderOptionsForOutput(output), ...options });
}

module.exports = {
  MEDIA_RENDERERS,
  SUPPORTED_MEDIA_TYPES,
  isTextOutputOnly,
  renderDisplay,
};
