const path = require("node:path");
const { createRequire } = require("node:module");
const requireCurrent = createRequire(path.join(__dirname, "..", "package.json"));

// These renders cross the production WebWorker boundary, including its
// MathJax initialization, serial conversion queue, and dynamic font loader.
// MathJax renders TeX errors as SVG too, so merely finding an SVG does not
// prove a successful render.
describe("LaTeX MathJax rendering in a persistent worker", () => {
  let renderLatexRuns, warmMathJax, disposeMathJax;

  beforeAll(() => requireCurrent("./lib/mathjax-client").disposeMathJax());
  beforeEach(() => {
    // A preceding lifecycle suite can have unloaded the package's modules.
    ({ renderLatexRuns, warmMathJax, disposeMathJax } = requireCurrent("./lib/mathjax-client"));
  });
  afterAll(() => disposeMathJax());

  const soleMath = (runs) => {
    expect(runs.length).toBe(1);
    expect(runs[0].kind).toBe("math");
    return runs[0];
  };
  const clean = (run) => {
    expect(run.svg).toContain("<svg");
    expect(run.svg).not.toContain("data-mjx-error");
    return run;
  };

  const glyphs = (run) => run.svg.match(/data-c="[^"]+"/g);

  it("loads MathJax in the worker and renders inline TeX to an SVG string", async () => {
    const run = clean(soleMath(await renderLatexRuns("$x^2 + 1$")));
    expect(run.display).toBe(false);
  });

  it("renders display math from $$...$$", async () => {
    const run = clean(soleMath(await renderLatexRuns("$$\\frac{1}{2}$$")));
    expect(run.display).toBe(true);
  });

  it("renders an align environment whole, ampersands intact", async () => {
    // The old delimiter stripper handed MathJax the environment's body
    // without the environment, so every align/eqnarray/multline rendered as
    // "Misplaced &".
    const runs = await renderLatexRuns("\\begin{align} a &= b \\\\ c &= d \\end{align}");
    const run = clean(soleMath(runs));
    expect(run.display).toBe(true);
  });

  it("renders consecutive environments as separate display runs", async () => {
    // Fused into one math string they are TeX's "erroneous nesting" error.
    const runs = await renderLatexRuns(
      "\\begin{equation}a=1\\end{equation}\\begin{equation}b=2\\end{equation}",
    );
    expect(runs.length).toBe(2);
    for (const run of runs) {
      expect(run.display).toBe(true);
      clean(run);
    }
  });

  it("keeps the prose around math runs", async () => {
    const runs = await renderLatexRuns("The value is $x^2$ meters");
    expect(runs.map((run) => run.kind)).toEqual(["text", "math", "text"]);
    expect(runs[0].text).toBe("The value is ");
    expect(runs[2].text).toBe(" meters");
    expect(clean(runs[1]).display).toBe(false);
  });

  it("renders Item's inline equations and row leading as one multiline formula", async () => {
    // bacadra.txgen.Item._repr_latex_ joins a list in modes i/i# with this
    // exact separator. FindTeX otherwise treats the two backslashes as an
    // escape and leaves the visible text `\[5pt]` between two SVGs.
    const source =
      "$\\displaystyle {I}_{y}=36410\\,\\mathrm{cm}^{4}$\n" +
      "\\\\[5pt]\n" +
      "$\\displaystyle {I}_{z}=9687\\,\\mathrm{cm}^{4}$";
    const run = clean(soleMath(await renderLatexRuns(source)));
    expect(run.display).toBe(true);
    expect(run.svg).toContain('data-lineleading="5pt"');
    expect(run.svg).toContain('data-mjx-lineno="1"');
  });

  it("keeps TeX row-break variants between inline formulae inside MathJax", async () => {
    for (const separator of ["\\\\", "\\\\[-2pt]", "\\\\*[1em]"]) {
      const run = clean(soleMath(await renderLatexRuns(`$a$\n${separator}\n$b$`)));
      expect(run.display).toBe(true);
      expect(run.svg).toContain('data-mjx-lineno="1"');
    }
  });

  it("folds an escaped dollar back into the text", async () => {
    const runs = await renderLatexRuns("Costs \\$5 for $x$ items");
    expect(runs.map((run) => run.kind)).toEqual(["text", "math", "text"]);
    expect(runs[0].text).toBe("Costs $5 for ");
  });

  it("returns one text run for input without math delimiters", async () => {
    const runs = await renderLatexRuns("\\par\\addvspace{\\medskipamount} S~355 J2");
    expect(runs).toEqual([{ kind: "text", text: "\\par\\addvspace{\\medskipamount} S~355 J2" }]);
  });

  it("wraps long display math instead of one endless line", async () => {
    const sum = Array.from({ length: 40 }, (_, i) => `x_{${i}}`).join(" + ");
    const run = clean(soleMath(await renderLatexRuns(`$$${sum}$$`)));
    // Unwrapped this is ~223ex wide; broken at the configured 50em it stays
    // near 100ex and grows in height instead.
    const width = parseFloat(/width="([\d.]+)ex"/.exec(run.svg)[1]);
    expect(width).toBeLessThan(150);
  });

  it("emits long inline math as sibling svgs that can wrap like words", async () => {
    const sum = Array.from({ length: 40 }, (_, i) => `x_{${i}}`).join(" + ");
    const run = clean(soleMath(await renderLatexRuns(`$${sum}$`)));
    expect((run.svg.match(/<svg/g) || []).length).toBeGreaterThan(1);
  });

  it("marks a genuine TeX error so the merror styling can color it", async () => {
    const run = soleMath(await renderLatexRuns("$\\frac{1}$"));
    expect(run.svg).toContain("data-mjx-error");
  });

  it("renders an undefined macro as literal text, not an error", async () => {
    // The noundefined package, as in a notebook.
    const run = soleMath(await renderLatexRuns("$\\foobarbaz{x}$"));
    expect(run.svg).toContain("<svg");
    expect(run.svg).not.toContain("data-mjx-error");
  });

  it("supports the notebook package set beyond base+ams", async () => {
    clean(soleMath(await renderLatexRuns("$\\ce{H2O + CO2}$"))); // mhchem
    clean(soleMath(await renderLatexRuns("$$A \\coloneqq B$$"))); // mathtools
    clean(soleMath(await renderLatexRuns("$\\braket{a|b}$"))); // braket
    clean(soleMath(await renderLatexRuns("$\\cancel{x}$"))); // cancel
    clean(soleMath(await renderLatexRuns("$\\upalpha$"))); // upgreek
  });

  it("renders text-mode markup inside \\text via textmacros", async () => {
    clean(soleMath(await renderLatexRuns("$\\text{\\textbf{Material}: S355}$")));
  });

  it("loads dynamic font chunks for glyphs outside the base set", async () => {
    // Double-struck, fraktur and script glyphs live in font chunks MathJax
    // fetches on demand through mathjax.asyncLoad; without that hook and the
    // promise-based convert, \mathbb{R} throws MathJax's retry signal.
    clean(soleMath(await renderLatexRuns("$\\mathbb{R}$")));
    clean(soleMath(await renderLatexRuns("$\\mathfrak{g}$")));
    clean(soleMath(await renderLatexRuns("$\\mathscr{L}$")));
  });

  it("keeps overlapping renders whole", async () => {
    // convertPromise can yield mid-conversion to load a chunk; concurrent
    // callers must each get their own complete result.
    const [a, b] = await Promise.all([
      renderLatexRuns("$\\mathbb{N}$ and $x$"),
      renderLatexRuns("$\\mathfrak{sl}_2$"),
    ]);
    expect(a.map((run) => run.kind)).toEqual(["math", "text", "math"]);
    clean(a[0]);
    clean(soleMath(b));
  });

  it("keeps user macros across later renders and warm-up calls", async () => {
    clean(soleMath(await renderLatexRuns("$\\newcommand{\\workerpersistentmacro}{x+37}$")));
    await warmMathJax();
    const macro = clean(soleMath(await renderLatexRuns("$\\workerpersistentmacro$")));
    const explicit = clean(soleMath(await renderLatexRuns("$x+37$")));
    expect(glyphs(explicit)).not.toBeNull();
    expect(glyphs(macro)).toEqual(glyphs(explicit));
  });

  it("applies macro definitions before overlapping renders while loading fonts", async () => {
    const [definition, use] = await Promise.all([
      renderLatexRuns("$\\newcommand{\\workerorderedmacro}{y+19}\\mathbb{C}$"),
      renderLatexRuns("$\\workerorderedmacro$"),
    ]);
    clean(soleMath(definition));
    const macro = clean(soleMath(use));
    const explicit = clean(soleMath(await renderLatexRuns("$y+19$")));
    expect(glyphs(explicit)).not.toBeNull();
    expect(glyphs(macro)).toEqual(glyphs(explicit));
  });

  it("keeps SVG font references local and IDs distinct after worker replacement", async () => {
    const first = clean(soleMath(await renderLatexRuns("$\\mathbb{R}+x$")));
    disposeMathJax();
    const second = clean(soleMath(await renderLatexRuns("$\\mathbb{R}+x$")));
    const ids = (run) => new Set([...run.svg.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
    const firstIds = ids(first);
    const secondIds = ids(second);
    expect(firstIds.size).toBeGreaterThan(0);
    expect(secondIds.size).toBeGreaterThan(0);
    expect([...firstIds].some((id) => secondIds.has(id))).toBe(false);
    for (const run of [first, second]) {
      const localIds = ids(run);
      const references = [...run.svg.matchAll(/(?:xlink:)?href="#([^"]+)"/g)];
      expect(references.length).toBeGreaterThan(0);
      for (const reference of references) expect(localIds.has(reference[1])).toBe(true);
    }
    expect(glyphs(first)).toEqual(glyphs(second));
  });
});
