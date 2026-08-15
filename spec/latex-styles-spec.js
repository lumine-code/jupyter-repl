const fs = require("fs");
const path = require("path");

// The renderer injects MathJax's SVG output without the document stylesheet
// MathJax attaches to its mjx-container, so styles/jupyter-repl.css restates
// the rules the injected markup relies on. The <mjx-break> set carries exact
// values — the MJX-ZERO font trick and the per-size letter-spacings that
// reproduce TeX inter-atom spacing — so this spec pins the restated
// declarations against the installed MathJax's SvgMath.styles and fails when
// an upgrade changes them or adds a rule the stylesheet does not restate.
describe("restated MathJax mjx-break styles", () => {
  let css;
  let styles;
  let zeroFontDataUrl;

  beforeAll(async () => {
    css = fs.readFileSync(path.join(__dirname, "..", "styles", "jupyter-repl.css"), "utf8");
    // The output jax first: the wrapper modules form an import cycle, and
    // loading Wrappers/math.js directly reads SvgWrapper before its module
    // has initialized — an error that then poisons the graph for every later
    // import, including the renderer's own.
    await import("@mathjax/src/mjs/output/svg.js");
    ({
      SvgMath: { styles },
    } = await import("@mathjax/src/mjs/output/svg/Wrappers/math.js"));
    ({ ZeroFontDataUrl: zeroFontDataUrl } = await import(
      "@mathjax/src/mjs/output/svg/Wrappers/zero.js"
    ));
  });

  // MathJax writes '-.999em' and 'MJX-ZERO ! important'; the stylesheet writes
  // '-0.999em' and '!important'. Same computed values, so compare normalized.
  const normalize = (value) =>
    String(value)
      .replace(/\s+/g, " ")
      .replace(/-\./g, "-0.")
      .replace(/\s*!\s*important/, " !important")
      .trim();

  // The declarations of the rule for `selector`, as a map. The nested blocks
  // in the stylesheet contain no inner braces, so scanning to the first `}` is
  // enough; requiring `{` right after the selector keeps a bare `mjx-break`
  // from matching its attribute-qualified siblings or the prose comment.
  const declarations = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`(?:^|[\\s}])${escaped}\\s*\\{([^}]*)\\}`));
    expect(match).withContext(`rule for "${selector}"`).not.toBeNull();
    const decls = {};
    for (const decl of match[1].split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
    }
    return decls;
  };

  it("restates every SvgMath rule, declaration for declaration", () => {
    for (const [upstreamSelector, upstreamDecls] of Object.entries(styles)) {
      if (upstreamSelector.startsWith("@font-face")) continue; // separate spec
      // The stylesheet scopes under .output-latex instead of the container.
      const selector = upstreamSelector.replace('mjx-container[jax="SVG"] ', "");
      const decls = declarations(selector);
      for (const [property, value] of Object.entries(upstreamDecls)) {
        expect(normalize(decls[property]))
          .withContext(`${selector} { ${property} }`)
          .toBe(normalize(value));
      }
    }
  });

  it("embeds MathJax's own MJX-ZERO font", () => {
    // The src value holds semicolons inside its data URL, so it is matched
    // verbatim rather than through the declaration parser.
    expect(css).toContain(`src: ${zeroFontDataUrl};`);
    expect(declarations("@font-face")["font-family"]).toBe("MJX-ZERO");
  });
});
