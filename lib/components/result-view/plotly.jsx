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
    etch.initialize(this);
    this.plot();
  }

  getFigure() {
    const figure = this.props.data;

    if (typeof figure === "string") {
      return JSON.parse(figure);
    }

    // The Plotly API *mutates* the figure to include a UID, which means
    // they won't take our frozen objects
    if (Object.isFrozen(figure)) {
      return cloneDeep(figure);
    }

    const { data = {}, layout = {} } = figure;
    return {
      data,
      layout,
    };
  }

  plot() {
    const plotDiv = this.refs.plot;
    if (!plotDiv) {
      return;
    }
    const figure = this.getFigure();
    // plotly.js-dist for better 3D/WebGL support
    this.Plotly = require("plotly.js-dist");

    // Transparent backgrounds, for 3D plot compatibility
    const layout = {
      ...figure.layout,
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
    };

    this.Plotly.newPlot(plotDiv, figure.data, layout, {
      modeBarButtonsToRemove: ["toImage"],
      modeBarButtonsToAdd: [
        {
          name: "Download plot as a png",
          icon: this.Plotly.Icons.camera,
          click: this.downloadImage,
        },
      ],
    });
  }

  downloadImage = (gd) => {
    this.Plotly.toImage(gd).then(function (dataUrl) {
      return lumine.window.downloadURL(dataUrl);
    });
  };

  render() {
    const { layout } = this.getFigure();
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

    return <div ref="plot" style={style} className="plotly-container" />;
  }

  update(props) {
    if (props.data === this.props.data) {
      this.props = props;
      return Promise.resolve();
    }
    this.props = props;
    return etch.update(this).then(() => {
      const plotDiv = this.refs.plot;
      if (!plotDiv || !this.Plotly) {
        return;
      }
      const figure = this.getFigure();
      plotDiv.data = figure.data;
      plotDiv.layout = figure.layout;
      this.Plotly.redraw(plotDiv);
    });
  }

  destroy() {
    // Plotly attaches its own listeners and WebGL contexts to the node.
    if (this.Plotly && this.refs.plot) {
      this.Plotly.purge(this.refs.plot);
    }
    return etch.destroy(this);
  }
}

const plotlyRenderer = (data) => <PlotlyTransform data={data} />;

const plotlyHtmlRenderer = (data) => {
  const figure = extractPlotlyFigure(data);
  return figure ? <PlotlyTransform data={figure} /> : null;
};

module.exports = {
  PlotlyTransform,
  callArguments,
  extractPlotlyFigure,
  plotlyRenderer,
  plotlyHtmlRenderer,
};
