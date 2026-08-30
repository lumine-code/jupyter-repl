/** @jsx etch.dom */
/**
 * Adapted from
 * https://github.com/nteract/nteract/blob/master/packages/transform-vega/src/index.tsx
 * Copyright (c) 2016 - present, nteract contributors All rights reserved.
 */
const etch = require("@lumine-code/etch");

/** All the information. All of it. On Vega (Lite) media types, at least. */
const MEDIA_TYPES = {
  "application/vnd.vega.v2+json": {
    kind: "vega",
    version: "2",
    vegaLevel: 2,
    mediaType: "application/vnd.vega.v2+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v2.json",
  },
  "application/vnd.vega.v3+json": {
    kind: "vega",
    version: "3",
    vegaLevel: 3,
    mediaType: "application/vnd.vega.v3+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v3.json",
  },
  "application/vnd.vega.v4+json": {
    kind: "vega",
    version: "4",
    vegaLevel: 4,
    mediaType: "application/vnd.vega.v4+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v4.json",
  },
  "application/vnd.vega.v5+json": {
    kind: "vega",
    version: "5",
    vegaLevel: 5,
    mediaType: "application/vnd.vega.v5+json",
    schemaPrefix: "https://vega.github.io/schema/vega/v5.json",
  },
  "application/vnd.vegalite.v1+json": {
    kind: "vega-lite",
    version: "1",
    vegaLevel: 2,
    mediaType: "application/vnd.vegalite.v1+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v1.json",
  },
  "application/vnd.vegalite.v2+json": {
    kind: "vega-lite",
    version: "2",
    vegaLevel: 3,
    mediaType: "application/vnd.vegalite.v2+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v2.json",
  },
  "application/vnd.vegalite.v3+json": {
    kind: "vega-lite",
    version: "3",
    vegaLevel: 5,
    mediaType: "application/vnd.vegalite.v3+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v3.json",
  },
  "application/vnd.vegalite.v4+json": {
    kind: "vega-lite",
    version: "4",
    vegaLevel: 5,
    mediaType: "application/vnd.vegalite.v4+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v4.json",
  },
  "application/vnd.vegalite.v5+json": {
    kind: "vega-lite",
    version: "5",
    vegaLevel: 6,
    mediaType: "application/vnd.vegalite.v5+json",
    schemaPrefix: "https://vega.github.io/schema/vega-lite/v5.json",
  },
};

/** Call the external library to do the embedding. */
async function embed(anchor, mediaType, spec, options = {}) {
  const version = MEDIA_TYPES[mediaType];
  const defaults = {
    actions: false,
    mode: version.kind,
  };
  // Map unsupported versions to latest supported (npm @nteract/any-vega@1.0.1
  // supports vega 2-5, vegalite 1-4)
  const embedVersion = {
    kind: version.kind,
    version: version.kind === "vega-lite" && version.version === "5" ? "4" : version.version,
  };
  // Required here rather than at module scope: the package ships 15M of
  // prebuilt vega bundles, and this module now loads at activation (the
  // jupyter.output service is built eagerly). Nothing should parse that
  // until a vega output actually renders.
  const { embed: embedVega } = require("@nteract/any-vega");
  const embedThisVega = await embedVega(embedVersion);
  return embedThisVega(anchor, spec, { ...options, ...defaults });
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

/** Embeds one Vega (Lite) spec, and reports a failure in place of the chart. */
class VegaEmbed {
  constructor(props) {
    this.props = props;
    this.embedError = null;
    this.embedResult = null;
    etch.initialize(this);
    this.callEmbedder();
  }

  render() {
    return (
      <div>
        {this.embedError ? (
          <div style={ERROR_STYLE}>{this.embedError.message || String(this.embedError)}</div>
        ) : null}
        <div ref="anchor" />
      </div>
    );
  }

  async callEmbedder() {
    const anchor = this.refs.anchor;
    if (!anchor) {
      return;
    }

    try {
      this.embedResult = await embed(anchor, this.props.mediaType, this.props.spec, {
        ...this.props.options,
      });
      this.props.resultHandler?.(this.embedResult);
    } catch (error) {
      this.props.errorHandler?.(error);
      this.embedError = error;
      etch.update(this);
    }
  }

  update(props) {
    // Re-embedding is expensive, so only a new spec is worth one.
    if (props.spec === this.props.spec) {
      this.props = props;
      return Promise.resolve();
    }
    this.props = props;
    this.embedError = null;
    this.finalize();
    return etch.update(this).then(() => this.callEmbedder());
  }

  // The Vega view holds its own listeners and animation frames, so it has to be
  // told to release them; removing the element is not enough.
  finalize() {
    if (this.embedResult) {
      if (this.embedResult.finalize) {
        this.embedResult.finalize();
      } else if (this.embedResult.view?.finalize) {
        this.embedResult.view.finalize();
      }
      this.embedResult = null;
    }
  }

  destroy() {
    this.finalize();
    return etch.destroy(this);
  }
}

/** A renderer for one Vega (Lite) media type, for the media-type table. */
const vegaRenderer = (mediaType) => (data) => <VegaEmbed mediaType={mediaType} spec={data} />;

module.exports = { MEDIA_TYPES, embed, VegaEmbed, vegaRenderer };
