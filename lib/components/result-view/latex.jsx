/** @jsx etch.dom */
/**
 * LaTeX rendering with MathJax 4.
 *
 * MathJax is loaded lazily and asynchronously from the ESM (mjs) build of
 * @mathjax/src via dynamic import(), so the large component modules load off
 * the render path the first time LaTeX output appears (a placeholder shows
 * meanwhile) instead of blocking the UI with a synchronous require. The
 * headless liteAdaptor + SVG output produce an SVG string we inject directly.
 */
const etch = require("@lumine-code/etch");

// Memoized initialization promise; resolves to { adaptor, htmlDoc }. Reset to
// null on failure so a later render can retry.
let mjPromise = null;

function ensureMathJax() {
  if (mjPromise) return mjPromise;

  mjPromise = (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] =
      await Promise.all([
        import("@mathjax/src/mjs/mathjax.js"),
        import("@mathjax/src/mjs/input/tex.js"),
        import("@mathjax/src/mjs/output/svg.js"),
        import("@mathjax/src/mjs/adaptors/liteAdaptor.js"),
        import("@mathjax/src/mjs/handlers/html.js"),
      ]);

    // TeX packages register themselves as import side effects (v4 requires
    // explicit registration).
    await Promise.all([
      import("@mathjax/src/mjs/input/tex/base/BaseConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/action/ActionConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/color/ColorConfiguration.js"),
    ]);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    const tex = new TeX({
      packages: ["base", "ams", "newcommand", "action", "color"],
    });
    const svg = new SVG({
      fontCache: "local",
      linebreaks: { inline: false, width: "100000em" }, // Disable line-breaking
    });
    const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg });

    return { adaptor, htmlDoc };
  })().catch((err) => {
    console.error("MathJax initialization error:", err);
    mjPromise = null;
    throw err;
  });

  return mjPromise;
}

// Strip math delimiters from LaTeX string
function stripDelimiters(latex) {
  let stripped = latex.trim();

  // Check for multiple equation environments - extract and combine them
  const envPattern =
    /\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\1\}/g;
  const envMatches = [...stripped.matchAll(envPattern)];

  if (envMatches.length > 1) {
    // Multiple environments - combine contents into gathered
    const contents = envMatches.map((m) => m[2].trim());
    return {
      math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}",
      displayMode: true,
    };
  }

  if (envMatches.length === 1) {
    // Single environment - just extract content
    return { math: envMatches[0][2].trim(), displayMode: true };
  }

  // Check for multiple $...$ or $$...$$ blocks
  const inlineMathPattern = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  const mathMatches = [...stripped.matchAll(inlineMathPattern)];

  if (mathMatches.length > 1) {
    // Multiple inline/display math blocks - combine into gathered
    const contents = mathMatches.map((m) => (m[1] || m[2]).trim());
    return {
      math: "\\begin{gathered}" + contents.join(" \\\\ ") + "\\end{gathered}",
      displayMode: true,
    };
  }

  // Remove display math delimiters
  if (stripped.startsWith("$$") && stripped.endsWith("$$")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }
  if (stripped.startsWith("\\[") && stripped.endsWith("\\]")) {
    return { math: stripped.slice(2, -2), displayMode: true };
  }

  // Remove inline math delimiters
  if (stripped.startsWith("$") && stripped.endsWith("$") && stripped.length > 2) {
    return { math: stripped.slice(1, -1), displayMode: false };
  }
  if (stripped.startsWith("\\(") && stripped.endsWith("\\)")) {
    return { math: stripped.slice(2, -2), displayMode: false };
  }

  // No math delimiters found - treat as plain text
  return { math: null, isTextMode: true, original: stripped };
}

// Render LaTeX to an SVG string using an initialized MathJax api.
function renderToSvg(api, latex, displayMode) {
  const node = api.htmlDoc.convert(latex, { display: displayMode });
  return api.adaptor.innerHTML(node);
}

/**
 * Strip delimiters, ensure MathJax is loaded, and render LaTeX to an SVG string.
 * Returns `{ textContent }` for non-math input or `{ svg, displayMode }` for
 * math. Exposed for tests so the async ESM load + render path can be exercised
 * headlessly (the liteAdaptor needs no browser DOM).
 */
async function renderLatexToSvg(latex) {
  const result = stripDelimiters(latex || "");
  if (result.isTextMode) {
    return { textContent: result.original };
  }
  const api = await ensureMathJax();
  return {
    svg: renderToSvg(api, result.math, result.displayMode),
    displayMode: result.displayMode,
  };
}

/**
 * Renders LaTeX to SVG, showing a placeholder until MathJax has loaded and the
 * conversion has finished.
 */
class LaTeX {
  constructor(props) {
    this.props = props;
    this.svg = null;
    this.textContent = null;
    this.displayMode = false;
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
      const out = await renderLatexToSvg(this.props.data || "");
      if (this.destroyed || token !== this.renderToken) return;
      this.svg = out.svg || null;
      this.displayMode = Boolean(out.displayMode);
      this.textContent = out.textContent || null;
      this.error = null;
    } catch (err) {
      console.error("MathJax rendering error:", err);
      if (this.destroyed || token !== this.renderToken) return;
      this.svg = null;
      this.textContent = null;
      this.error = err.message || "MathJax failed to initialize";
    }
    return etch.update(this);
  }

  render() {
    const latex = this.props.data || "";

    // MathJax error - show original LaTeX
    if (this.error) {
      return (
        <div className="output-latex output-latex-error">
          <code style={{ color: "#cc0000" }}>{latex}</code>
        </div>
      );
    }

    // Text-mode LaTeX (no math), as inline text so it composes with the math
    // runs around it. A block child here would split the inline wrapper in
    // two and leave an empty line box above and below the text.
    if (this.textContent) {
      return (
        <div className="output-latex output-latex-text">
          <span style={{ whiteSpace: "pre-wrap" }}>{this.textContent}</span>
        </div>
      );
    }

    // Successfully rendered math
    if (this.svg) {
      const style = this.displayMode ? { textAlign: "center", margin: "0.5em 0" } : {};
      return <div className="output-latex" style={style} innerHTML={this.svg} />;
    }

    // Loading state
    return (
      <div className="output-latex output-latex-loading">
        <span style={{ color: "#888" }}>Rendering...</span>
      </div>
    );
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

module.exports = { LaTeX, latexRenderer, renderLatexToSvg };
