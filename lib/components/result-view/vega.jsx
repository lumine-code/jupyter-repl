/** @jsx etch.dom */
/** Vega and Vega-Lite rendering through the official, current runtime. */
const etch = require("@lumine-code/etch");

const MEDIA_TYPES = {
  "application/vnd.vega.v6.json": { kind: "vega", version: "6" },
  "application/vnd.vega.v6+json": { kind: "vega", version: "6" },
  "application/vnd.vega.v5.json": { kind: "vega", version: "5" },
  "application/vnd.vega.v5+json": { kind: "vega", version: "5" },
  "application/vnd.vegalite.v6.json": { kind: "vega-lite", version: "6" },
  "application/vnd.vegalite.v6+json": { kind: "vega-lite", version: "6" },
  "application/vnd.vegalite.v5.json": { kind: "vega-lite", version: "5" },
  "application/vnd.vegalite.v5+json": { kind: "vega-lite", version: "5" },
};

let embedPromise = null;

function loadVegaEmbed(
  importer = () => Promise.resolve().then(() => require("../../vendor/vega-embed")),
) {
  if (!embedPromise) {
    embedPromise = importer()
      .then((module) => module.default || module)
      .then((embedder) => {
        if (typeof embedder !== "function") {
          throw new TypeError("vega-embed did not export an embed function");
        }
        return embedder;
      })
      .catch((error) => {
        embedPromise = null;
        throw error;
      });
  }
  return embedPromise;
}

// Kept as an object so specs can replace the loader without intercepting the
// language-level dynamic import. A failed import clears the cache and can be
// retried by the next output.
const runtime = {
  load() {
    return loadVegaEmbed();
  },
  reset() {
    embedPromise = null;
  },
};

async function embed(anchor, mediaType, spec, options = {}) {
  const format = MEDIA_TYPES[mediaType];
  if (!format) {
    throw new TypeError(`Unsupported Vega media type: ${mediaType}`);
  }
  const embedVega = await runtime.load();
  return embedVega(anchor, spec, {
    ...options,
    actions: false,
    ast: true,
    mode: format.kind,
  });
}

const ERROR_STYLE = {
  color: "#dc3545",
  backgroundColor: "#f8d7da",
  border: "1px solid #f5c6cb",
  borderRadius: "4px",
  padding: "8px 12px",
  margin: "4px 0",
  fontFamily: "monospace",
  fontSize: "12px",
};

function finalizeResult(result) {
  if (result?.finalize) {
    result.finalize();
  } else {
    result?.view?.finalize?.();
  }
}

/** Embeds one Vega spec and owns every asynchronous result it creates. */
class VegaEmbed {
  constructor(props) {
    this.props = props;
    this.embedError = null;
    this.embedResult = null;
    this.destroyed = false;
    this.renderToken = 0;
    etch.initialize(this);
    this.callEmbedder();
  }

  render() {
    return (
      <div className="output-vega">
        {this.embedError ? (
          <div className="output-vega-error" style={ERROR_STYLE}>
            <div>{this.embedError.message || String(this.embedError)}</div>
            {this.props.fallback ? <pre className="output-text">{this.props.fallback}</pre> : null}
          </div>
        ) : null}
        <div ref="anchor" key={this.renderToken} />
      </div>
    );
  }

  async callEmbedder() {
    const anchor = this.refs.anchor;
    if (!anchor || this.destroyed) return;

    const token = ++this.renderToken;
    this.finalize();
    this.embedError = null;

    try {
      const result = await embed(anchor, this.props.mediaType, this.props.spec, {
        ...this.props.options,
      });
      if (this.destroyed || token !== this.renderToken) {
        finalizeResult(result);
        return;
      }
      this.embedResult = result;
      this.props.resultHandler?.(result);
    } catch (error) {
      if (this.destroyed || token !== this.renderToken) return;
      this.embedError = error;
      this.props.errorHandler?.(error);
      return etch.update(this);
    }
  }

  update(props) {
    const changed = props.spec !== this.props.spec || props.mediaType !== this.props.mediaType;
    this.props = props;
    if (!changed) return Promise.resolve();

    // Invalidate an import/embed already in flight before yielding to etch.
    this.renderToken++;
    this.embedError = null;
    this.finalize();
    return etch.update(this).then(() => this.callEmbedder());
  }

  finalize() {
    if (this.embedResult) {
      finalizeResult(this.embedResult);
      this.embedResult = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.renderToken++;
    this.finalize();
    return etch.destroy(this);
  }
}

const vegaRenderer = (mediaType) => (data, metadata, bundle) => (
  <VegaEmbed mediaType={mediaType} spec={data} fallback={bundle?.["text/plain"]} />
);

module.exports = {
  MEDIA_TYPES,
  loadVegaEmbed,
  runtime,
  embed,
  finalizeResult,
  VegaEmbed,
  vegaRenderer,
};
