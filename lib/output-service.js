const { ansiNodes, escapeCarriageReturn, truncateOutput } = require("./ansi-utils");
const {
  OUTPUT_TYPES,
  reduceOutputs,
  normalizeOutput,
  msgSpecToNotebookFormat,
  getOutputPlainText,
  sanitizeHtml,
} = require("./output-utils");
const OutputStore = require("./store/output");
const {
  MEDIA_RENDERERS,
  SUPPORTED_MEDIA_TYPES,
  isTextOutputOnly,
  renderDisplay,
} = require("./components/result-view/display");
const { renderOutput, renderRichMedia } = require("./components/output");
const { renderStatus } = require("./components/result-view/status");
const History = require("./components/result-view/history");
const ScrollList = require("./components/result-view/list");
const {
  getImage,
  getAllText,
  getSourceText,
  hasCopyableContent,
  copyToClipboard,
  saveImage,
  openInEditor,
} = require("./components/result-view/output-actions");

/**
 * The `jupyter.output` service: this package's Jupyter output rendering, for
 * the panels and viewers that live in other packages.
 *
 * Everything here is the exact machinery the REPL renders its own results
 * with — one implementation, one copy of the heavy renderers (MathJax, plotly,
 * vega), one settings page. The shape a consumer sees is documented in
 * `docs/jupyter.output.md`.
 *
 * Renderers return etch virtual nodes (or etch component classes used as JSX
 * tags), always elements — never bare fragments, whose identity does not
 * survive a package boundary.
 */
function pickRenderers(mediaTypes) {
  const picked = {};
  for (const mediaType of mediaTypes) {
    if (MEDIA_RENDERERS[mediaType]) {
      picked[mediaType] = MEDIA_RENDERERS[mediaType];
    }
  }
  return picked;
}

const outputService = Object.freeze({
  // rendering
  renderDisplay,
  renderOutput,
  renderRichMedia,
  renderStatus,
  MEDIA_RENDERERS,
  SUPPORTED_MEDIA_TYPES,
  pickRenderers,
  isTextOutputOnly,

  // text
  ansiNodes,
  ansiToText: (text) => require("anser").ansiToText(text || ""),
  escapeCarriageReturn,
  truncateOutput,
  sanitizeHtml,

  // data
  OutputStore,
  reduceOutputs,
  normalizeOutput,
  msgSpecToNotebookFormat,
  getOutputPlainText,
  OUTPUT_TYPES,

  // components
  History,
  ScrollList,

  // actions
  getImage,
  getAllText,
  getSourceText,
  hasCopyableContent,
  copyToClipboard,
  saveImage,
  openInEditor,
});

module.exports = { outputService, pickRenderers };
