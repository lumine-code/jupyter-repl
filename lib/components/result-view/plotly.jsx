/** @jsx etch.dom */
/**
 * Adapted from
 * https://github.com/nteract/nteract/blob/master/packages/transform-plotly/src/index.tsx
 * Copyright (c) 2016 - present, nteract contributors All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 *
 * Same as the upstream transform, plus the ability to download a plot from an
 * Electron context.
 */
const etch = require("@lumine-code/etch");
const cloneDeep = require("lodash/cloneDeep");

const runtime = {
  load() {
    return require("plotly.js-dist");
  },
};
const htmlFigures = new WeakMap();

const CLOSING_DELIMITER = { "(": ")", "[": "]", "{": "}" };

/**
 * Split the arguments of a JavaScript call without evaluating them. Plotly's
 * HTML MIME representation writes the figure as JSON literals inside a
 * Plotly.newPlot/Plotly.react call; only those literals are accepted below.
 */
function callArguments(source, openParen) {
  const args = [];
  const stack = ["("];
  let start = openParen + 1;
  let quote = null;
  let escaped = false;

  for (let index = start; index < source.length; index++) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }

    if (CLOSING_DELIMITER[character]) {
      stack.push(character);
      continue;
    }

    const expected = CLOSING_DELIMITER[stack[stack.length - 1]];
    if (character === expected) {
      if (stack.length === 1) {
        args.push(source.slice(start, index).trim());
        return args;
      }
      stack.pop();
      continue;
    }

    if (character === "," && stack.length === 1) {
      args.push(source.slice(start, index).trim());
      start = index + 1;
    }
  }

  return null;
}

/** Extract a JSON Plotly figure from its notebook HTML representation. */
function extractPlotlyFigure(html) {
  if (typeof html !== "string") return null;

  const pattern = /\bPlotly\.(?:newPlot|react)\s*\(/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const openParen = match.index + match[0].lastIndexOf("(");
    const args = callArguments(html, openParen);
    if (!args || args.length < 3) continue;

    try {
      const data = JSON.parse(args[1]);
      const layout = JSON.parse(args[2]);
      if (Array.isArray(data) && layout && typeof layout === "object" && !Array.isArray(layout)) {
        return { data, layout };
      }
    } catch {
      // Variable references and executable JavaScript are deliberately not
      // supported. Try another Plotly call, then let the MIME bundle fall back.
    }
  }

  return null;
}

class PlotlyTransform {
  constructor(props) {
    this.props = props;
    this.destroyed = false;
    this.renderToken = 0;
    this.plotChain = Promise.resolve();
    this.hasPlot = false;
    this.readFigure();
    etch.initialize(this);
    this.plotPromise = this.plot();
  }

  readFigure() {
    try {
      const figure =
        typeof this.props.data === "string" ? JSON.parse(this.props.data) : this.props.data;
      if (!figure || typeof figure !== "object" || Array.isArray(figure)) {
        throw new TypeError("This output does not contain a Plotly figure.");
      }
      // Plotly mutates trace objects even when the top-level figure is not
      // frozen. The kernel output stays intact for other views and export.
      this.figure = cloneDeep(figure);
      this.plotError = null;
    } catch (error) {
      this.figure = null;
      this.plotError = error;
    }
  }

  getFigure() {
    return this.figure;
  }

  plot() {
    const plotDiv = this.refs.plot;
    const figure = this.getFigure();
    const token = ++this.renderToken;
    if (!plotDiv || this.destroyed) return Promise.resolve();

    // Plotly yields while initializing. Updating the same node before that
    // promise settles races its internal state, so serialize work and skip
    // any superseded request that has not begun yet.
    const job = this.plotChain.then(async () => {
      if (this.destroyed || token !== this.renderToken) return;
      if (!figure) {
        this.purge(plotDiv);
        this.hasPlot = false;
        return;
      }
      try {
        this.Plotly ||= runtime.load();
        const layout = {
          ...figure.layout,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
        };
        const options = {
          modeBarButtonsToRemove: ["toImage"],
          modeBarButtonsToAdd: [
            {
              name: "Download plot as a png",
              icon: this.Plotly.Icons.camera,
              click: this.downloadImage,
            },
          ],
        };
        const method = this.hasPlot ? "react" : "newPlot";
        await this.Plotly[method](plotDiv, figure.data || [], layout, options);
        this.hasPlot = true;
      } catch (error) {
        this.hasPlot = false;
        if (!this.destroyed && token === this.renderToken) {
          this.plotError = error;
          await etch.update(this);
        }
      } finally {
        // destroy() can purge before a slow newPlot finishes creating its
        // listeners or WebGL context. Purge again once that work has ended.
        if (this.destroyed) this.purge(plotDiv);
      }
    });
    this.plotChain = job;
    return job;
  }

  downloadImage = async (gd) => {
    try {
      const dataUrl = await this.Plotly.toImage(gd);
      if (!this.destroyed) return lumine.window.downloadURL(dataUrl);
    } catch (error) {
      if (!this.destroyed) {
        lumine.notifications.addError("Failed to download plot", { detail: error.message });
      }
    }
  };

  render() {
    const layout = this.figure?.layout;
    const style = {
      width: "100%",
      minHeight: "400px",
    };

    if (layout && layout.width) {
      style.width = layout.width;
    }
    if (layout && layout.height) {
      style.height = layout.height;
      style.minHeight = layout.height;
    }

    return (
      <div className="output-plotly">
        {this.plotError ? (
          <div className="output-plotly-error">
            <div>{this.plotError.message || String(this.plotError)}</div>
            {this.props.fallback ? <pre className="output-text">{this.props.fallback}</pre> : null}
          </div>
        ) : null}
        <div ref="plot" style={style} className="plotly-container" />
      </div>
    );
  }

  update(props) {
    if (props.data === this.props.data) {
      this.props = props;
      return Promise.resolve();
    }
    this.props = props;
    this.renderToken++;
    this.readFigure();
    this.plotPromise = etch.update(this).then(() => this.plot());
    return this.plotPromise;
  }

  purge(plotDiv) {
    if (!this.Plotly || !plotDiv) return;
    try {
      this.Plotly.purge(plotDiv);
    } catch (error) {
      console.error("[jupyter-repl] Failed to dispose a Plotly figure:", error);
    }
  }

  destroy() {
    this.destroyed = true;
    this.renderToken++;
    this.purge(this.refs.plot);
    return etch.destroySync(this);
  }
}

const plotlyRenderer = (data, metadata, bundle) => (
  <PlotlyTransform data={data} fallback={bundle?.["text/plain"]} />
);

const plotlyHtmlRenderer = (data, metadata, bundle) => {
  const canCache = bundle && typeof bundle === "object";
  let cached = canCache ? htmlFigures.get(bundle) : null;
  if (!cached || cached.source !== data) {
    cached = { source: data, figure: extractPlotlyFigure(data) };
    if (canCache) htmlFigures.set(bundle, cached);
  }
  // Stable data identity prevents every parent redraw from reparsing and
  // redrawing an unchanged HTML figure. The bundle owns this weak cache.
  return cached.figure ? (
    <PlotlyTransform data={cached.figure} fallback={bundle?.["text/plain"]} />
  ) : null;
};

module.exports = {
  PlotlyTransform,
  callArguments,
  extractPlotlyFigure,
  plotlyRenderer,
  plotlyHtmlRenderer,
  runtime,
};
