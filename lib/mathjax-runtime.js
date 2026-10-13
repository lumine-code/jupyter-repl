/**
 * Stateful MathJax renderer owned by one WebWorker. Loading ESM through Node's
 * require(esm) keeps initialization and conversion entirely off the UI thread.
 */
function createMathJaxRenderer(idPrefix) {
  // Memoized initialization promise; resolves to { adaptor, htmlDoc, findTeX }.
  // Reset to null on failure so a later render can retry.
  let mjPromise = null;

  function ensureMathJax() {
    if (mjPromise) return mjPromise;

    mjPromise = (async () => {
      const { mathjax } = require("@mathjax/src/mjs/mathjax.js");
      const { TeX } = require("@mathjax/src/mjs/input/tex.js");
      const { SVG } = require("@mathjax/src/mjs/output/svg.js");
      const { liteAdaptor } = require("@mathjax/src/mjs/adaptors/liteAdaptor.js");
      const { RegisterHTMLHandler } = require("@mathjax/src/mjs/handlers/html.js");
      const { FindTeX } = require("@mathjax/src/mjs/input/tex/FindTeX.js");

      // Node's loader must load the same ESM font classes as the base font.
      // Native import() in an Electron WebWorker can leave dynamic glyphs
      // unresolved and MathJax retrying indefinitely. Load explicit mjs files.
      const { createRequire } = require("node:module");
      const { fileURLToPath } = require("node:url");
      const loadModule = createRequire(require.resolve("@mathjax/src/mjs/mathjax.js"));
      mathjax.asyncLoad = (name) =>
        Promise.resolve().then(() => {
          const filename = name.startsWith("file:") ? fileURLToPath(name) : name;
          return loadModule(filename.replace(/^(@mathjax\/[^/]+)\/js\//, "$1/mjs/"));
        });

      // Direct access bypasses MathJax's component autoloader. Register the
      // notebook extension set explicitly, preserving the existing capabilities.
      for (const configuration of [
        "base/BaseConfiguration",
        "ams/AmsConfiguration",
        "newcommand/NewcommandConfiguration",
        "configmacros/ConfigMacrosConfiguration",
        "noundefined/NoUndefinedConfiguration",
        "action/ActionConfiguration",
        "color/ColorConfiguration",
        "boldsymbol/BoldsymbolConfiguration",
        "braket/BraketConfiguration",
        "cancel/CancelConfiguration",
        "mathtools/MathtoolsConfiguration",
        "mhchem/MhchemConfiguration",
        "textcomp/TextcompConfiguration",
        "textmacros/TextMacrosConfiguration",
        "unicode/UnicodeConfiguration",
        "upgreek/UpgreekConfiguration",
      ])
        require(`@mathjax/src/mjs/input/tex/${configuration}.js`);

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

    // FindTeX is a page scanner, so with processEscapes enabled it reads `\\`
    // between two delimited formulae as an escaped backslash replacement. That
    // turns `$a$ \\[5pt] $b$` into math, the literal text `\[5pt]`, and math.
    // In a text/latex bundle the same token is TeX's row separator. Put formulae
    // connected only by that separator back into one conversion, where MathJax
    // handles the optional star and line-leading dimension itself. A multiline
    // conversion is display math so MathJax lays out the requested vertical
    // leading in the SVG rather than emitting independent inline SVG segments.
    const joined = [];
    const rowBreak = /^\s*\\(\*?(?:\[[^\]\r\n]*\])?)\s*$/;
    for (let i = 0; i < runs.length; i++) {
      const run = runs[i];
      if (run.kind !== "math" || run.display) {
        joined.push(run);
        continue;
      }

      let math = run.math;
      let end = i;
      while (end + 2 < runs.length) {
        const separator = runs[end + 1];
        const next = runs[end + 2];
        const match = separator.kind === "text" ? rowBreak.exec(separator.text) : null;
        if (!match || next.kind !== "math" || next.display) break;
        math += ` \\\\${match[1]} ${next.math}`;
        end += 2;
      }

      if (end === i) {
        joined.push(run);
      } else {
        joined.push({ kind: "math", math, display: true });
        i = end;
      }
    }
    return joined;
  }

  // Renders are chained, not raced: convertPromise can yield mid-conversion to
  // load a font chunk, and with the shared TeX instance the order \newcommand
  // definitions land in is part of the output — two overlapping renders must
  // not interleave.
  let renderChain = Promise.resolve();

  /**
   * Ensure MathJax is loaded, split the input into runs, and convert each math
   * run to an SVG string. Returns an array of `{ kind: "text", text }` and
   * `{ kind: "math", display, svg }` runs. The liteAdaptor needs no browser DOM,
   * so conversion and serialization remain inside the worker. MathJax renders
   * TeX errors as merror groups carrying a `data-mjx-error` attribute.
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
        // Surviving SVG can outlive a failed/replaced worker. Retain MathJax's
        // per-SVG counter and namespace both definitions and their references.
        runs.push({
          kind: "math",
          display: run.display,
          svg: api.adaptor
            .innerHTML(node)
            .replace(/\b(id|(?:xlink:)?href)="(#?)MJX-/g, `$1="$2MJX-${idPrefix}-`),
        });
      }
      return runs;
    });
    renderChain = job.catch(() => {});
    return job;
  }

  return { warm: ensureMathJax, render: renderLatexRuns };
}

module.exports = { createMathJaxRenderer };
