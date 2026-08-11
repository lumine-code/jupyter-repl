/** @jsx etch.dom */
/**
 * LaTeX rendering with MathJax 4.
 *
 * MathJax is loaded lazily and asynchronously from the ESM (mjs) build of
 * @mathjax/src via dynamic import(), so the large component modules load off
 * the render path the first time LaTeX output appears (a placeholder shows
 * meanwhile) instead of blocking the UI with a synchronous require. The
 * headless liteAdaptor + SVG output produce SVG strings we inject directly.
 *
 * The input is split by MathJax's own FindTeX — the same scanner it runs over
 * a page — so a bundle is what it is in a notebook: prose stays prose, every
 * `$…$`/`$$…$$`/`\(…\)`/`\[…\]` run and every top-level environment becomes
 * math, and `\$` stays a dollar sign. Each math run is converted on its own,
 * which is also what lets consecutive environments render instead of tripping
 * TeX's "erroneous nesting".
 */
const etch = require("@lumine-code/etch");

// Memoized initialization promise; resolves to { adaptor, htmlDoc, findTeX }.
// Reset to null on failure so a later render can retry.
let mjPromise = null;

function ensureMathJax() {
  if (mjPromise) return mjPromise;

  mjPromise = (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { FindTeX }] =
      await Promise.all([
        import("@mathjax/src/mjs/mathjax.js"),
        import("@mathjax/src/mjs/input/tex.js"),
        import("@mathjax/src/mjs/output/svg.js"),
        import("@mathjax/src/mjs/adaptors/liteAdaptor.js"),
        import("@mathjax/src/mjs/handlers/html.js"),
        import("@mathjax/src/mjs/input/tex/FindTeX.js"),
        // Registers mathjax.asyncLoad. The font ships glyphs outside the base
        // set (double-struck, fraktur, script, …) as chunks loaded on demand;
        // without this hook a \mathbb{R} throws MathJax's retry signal, which
        // is also why every conversion below goes through convertPromise.
        import("@mathjax/src/mjs/util/asyncLoad/esm.js"),
      ]);

    // TeX packages register themselves as import side effects (v4 requires
    // explicit registration). The set is MathJax's own default-autoload list —
    // autoload itself needs the component loader, which the direct mjs imports
    // bypass — plus mathtools, and noundefined so an unknown macro renders as
    // red literal text instead of an error, as it does in a notebook.
    await Promise.all([
      import("@mathjax/src/mjs/input/tex/base/BaseConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/configmacros/ConfigMacrosConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/noundefined/NoUndefinedConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/action/ActionConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/color/ColorConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/boldsymbol/BoldsymbolConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/braket/BraketConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/cancel/CancelConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/mathtools/MathtoolsConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/mhchem/MhchemConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/textcomp/TextcompConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/unicode/UnicodeConfiguration.js"),
      import("@mathjax/src/mjs/input/tex/upgreek/UpgreekConfiguration.js"),
    ]);

    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);

    // One shared TeX instance, deliberately: \newcommand definitions persist
    // across renders, files, and kernels — the same page-global behavior a
    // notebook has, where defining a macro in one cell makes it available in
    // every later render.
    const tex = new TeX({
      packages: [
        "base",
        "ams",
        "newcommand",
        "configmacros",
        "noundefined",
        "action",
        "color",
        "boldsymbol",
        "braket",
        "cancel",
        "mathtools",
        "mhchem",
        "textcomp",
        "textmacros",
        "unicode",
        "upgreek",
      ],
    });
    const svg = new SVG({
      fontCache: "local",
      // Wide math wraps instead of running out the side of the bubble:
      // display math breaks internally at the width below, inline math is
      // emitted as sibling <svg> segments that wrap like words at whatever
      // width the surrounding container really has.
      displayOverflow: "linebreak",
      linebreaks: { inline: true, width: "50em" },
    });
    const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg });

    // `$…$` is off by default in MathJax (too many false positives on a web
    // page); a text/latex bundle is TeX by declaration, so it is on here.
    // processEscapes and processEnvironments are on by default.
    const findTeX = new FindTeX({
      inlineMath: [
        ["$", "$"],
        ["\\(", "\\)"],
      ],
    });

    return { adaptor, htmlDoc, findTeX };
  })().catch((err) => {
    console.error("MathJax initialization error:", err);
    mjPromise = null;
    throw err;
  });

  return mjPromise;
}

/**
 * Split a text/latex string into text and math runs with MathJax's FindTeX.
 * An item without a display flag is a character replacement (`\$` → `$`) and
 * folds back into the surrounding text.
 */
function splitRuns(findTeX, source) {
  const items = findTeX.findMath([source]);
  const runs = [];
  const pushText = (text) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.kind === "text") {
      last.text += text;
    } else {
      runs.push({ kind: "text", text });
    }
  };

  let at = 0;
  for (const item of items) {
    pushText(source.slice(at, item.start.n));
    if (item.display == null) {
      pushText(item.math);
    } else {
      runs.push({ kind: "math", math: item.math, display: item.display });
    }
    at = item.end.n;
  }
  pushText(source.slice(at));
  return runs;
}

// Renders are chained, not raced: convertPromise can yield mid-conversion to
// load a font chunk, and with the shared TeX instance the order \newcommand
// definitions land in is part of the output — two overlapping renders must
// not interleave.
let renderChain = Promise.resolve();

/**
 * Ensure MathJax is loaded, split the input into runs, and convert each math
 * run to an SVG string. Returns an array of `{ kind: "text", text }` and
 * `{ kind: "math", display, svg }` runs. Exposed for tests so the async ESM
 * load + render path can be exercised headlessly (the liteAdaptor needs no
 * browser DOM). A TeX error never rejects — MathJax renders it as an merror
 * group carrying a `data-mjx-error` attribute.
 */
async function renderLatexRuns(source) {
  const api = await ensureMathJax();
  const job = renderChain.then(async () => {
    const runs = [];
    for (const run of splitRuns(api.findTeX, source || "")) {
      if (run.kind === "text") {
        runs.push(run);
        continue;
      }
      const node = await api.htmlDoc.convertPromise(run.math, { display: run.display });
      runs.push({ kind: "math", display: run.display, svg: api.adaptor.innerHTML(node) });
    }
    return runs;
  });
  renderChain = job.catch(() => {});
  return job;
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

    // Loading state
    return (
      <div className="output-latex output-latex-loading">
        <span>Rendering...</span>
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

module.exports = { LaTeX, latexRenderer, renderLatexRuns };
