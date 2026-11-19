/** @jsx etch.dom */
const etch = require("@lumine-code/etch");
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
const {
  SUPPORTED_MEDIA_TYPES,
  VEGA_MEDIA_TYPES,
  WIDGET_VIEW,
  isTextOutputOnly,
} = require("../../output-media");

/**
 * Every media type this package can render, mapped to the function that renders
 * it. Upstream expressed the same set as React children of a `RichMedia`
 * element and cloned the matching one; a table says it directly, and lets
 * `isTextOutputOnly` ask what is supported without walking a virtual tree.
 */
const MEDIA_RENDERERS = {
  [WIDGET_VIEW]: widgetRenderer,
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

// Etch preserves keyed entries. Compare the fields that can change in place
// so a growing stream updates its row without formatting older MIME bundles.
class OutputDisplay {
  constructor(props) {
    this.setOutput(props);
    this.className = props.className;
    this.hidden = props.hidden;
    etch.initialize(this);
  }

  setOutput({ output, maxLength }) {
    this.output = output;
    this.maxLength = maxLength;
    this.text = output.text;
    this.data = output.data;
    this.metadata = output.metadata;
    this.renderedOutput = renderDisplay(output);
  }

  update(props) {
    const { output, className, hidden, maxLength } = props;
    const contentChanged =
      output !== this.output ||
      maxLength !== this.maxLength ||
      output.text !== this.text ||
      output.data !== this.data ||
      output.metadata !== this.metadata;
    if (!contentChanged && className === this.className && hidden === this.hidden)
      return Promise.resolve();
    if (contentChanged) this.setOutput(props);
    this.className = className;
    this.hidden = hidden;
    return etch.update(this);
  }

  render() {
    return (
      <div className={this.className} hidden={this.hidden}>
        {this.renderedOutput}
      </div>
    );
  }

  destroy() {
    return etch.destroySync(this);
  }
}

module.exports = {
  MEDIA_RENDERERS,
  SUPPORTED_MEDIA_TYPES,
  isTextOutputOnly,
  renderDisplay,
  OutputDisplay,
};
