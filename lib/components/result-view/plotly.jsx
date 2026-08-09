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
      return atom.window.downloadURL(dataUrl);
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

module.exports = { PlotlyTransform, plotlyRenderer };
