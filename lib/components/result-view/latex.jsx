/** @jsx etch.dom */
/**
 * LaTeX output whose stateful MathJax conversion runs in one package-owned
 * WebWorker. The liteAdaptor returns text/math runs with self-contained SVG;
 * this component only displays the placeholder and patches the completed DOM.
 */
const etch = require("@lumine-code/etch");
const { renderSpinner } = require("./status");

function renderLatexRuns(source) {
  return require("../../mathjax-client").renderLatexRuns(source);
}

/**
 * Renders LaTeX, showing a placeholder until MathJax has loaded and the
 * conversion has finished.
 */
class LaTeX {
  constructor(props) {
    this.props = props;
    this.runs = null;
    this.error = null;
    this.destroyed = false;
    // Increments per render request so a slow async render can detect that a
    // newer request (or a destroy) has superseded it and skip its update.
    this.renderToken = 0;

    etch.initialize(this);
    this.renderLatex();
  }

  async renderLatex() {
    const token = ++this.renderToken;
    try {
      const runs = await renderLatexRuns(this.props.data || "");
      if (this.destroyed || token !== this.renderToken) return;
      this.runs = runs;
      this.error = null;
    } catch (err) {
      // TeX errors render as merror groups; reaching here means MathJax
      // itself failed to load or convert.
      console.error("MathJax rendering error:", err);
      if (this.destroyed || token !== this.renderToken) return;
      this.runs = null;
      this.error = err.message || "MathJax failed to initialize";
    }
    return etch.update(this);
  }

  render() {
    // MathJax failed to load — show the original LaTeX source.
    if (this.error) {
      return (
        <div className="output-latex output-latex-error">
          <code>{this.props.data || ""}</code>
        </div>
      );
    }

    if (this.runs) {
      return (
        <div className="output-latex">
          {this.runs.map((run) => {
            if (run.kind === "text") {
              return <span className="latex-text">{run.text}</span>;
            }
            return run.display ? (
              <div className="latex-display" innerHTML={run.svg} />
            ) : (
              <span className="latex-inline" innerHTML={run.svg} />
            );
          })}
        </div>
      );
    }

    return renderSpinner(undefined, "output-latex output-latex-loading spinner");
  }

  update(props) {
    if (props.data === this.props.data) {
      this.props = props;
      return Promise.resolve();
    }
    this.props = props;
    return this.renderLatex();
  }

  destroy() {
    this.destroyed = true;
    return etch.destroy(this);
  }
}

const latexRenderer = (data) => <LaTeX data={data} />;

module.exports = { LaTeX, latexRenderer, renderLatexRuns };
