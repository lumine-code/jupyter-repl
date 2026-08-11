const fs = require("fs");
const path = require("path");

const {
  scopeStylesheet,
  ensureWidgetStyles,
  disposeWidgetStyles,
  SOURCES,
  SCOPE,
} = require("../lib/components/result-view/widget-styles");

// The ipywidgets stylesheets are read from node_modules and injected at
// runtime, with their theme replaced: upstream's labvariables.css declares the
// whole --jp-* palette on :root, hard-coded light, so styles/jupyter-repl.css
// supplies those names from the active Lumine theme instead.
//
// The load-bearing test is the first one. A widget whose stylesheet references
// a --jp-* name nothing declares does not fail loudly — it renders with the
// property unset, which for a slider means an invisible track and for a button
// means no colour at all. An ipywidgets upgrade that introduces a variable must
// fail here rather than in someone's editor.

const STYLESHEET = path.join(__dirname, "..", "styles", "jupyter-repl.css");

function readSource(packageName, relativePath) {
  const manifest = require.resolve(`${packageName}/package.json`);
  return fs.readFileSync(path.join(path.dirname(manifest), relativePath), "utf8");
}

/** Every --jp-* name the vendor stylesheets read but do not declare. */
function requiredVariables() {
  const used = new Set();
  const declared = new Set();
  for (const [pkg, file] of SOURCES) {
    const source = readSource(pkg, file);
    for (const match of source.matchAll(/var\(\s*(--jp-[a-z0-9-]+)/g)) {
      used.add(match[1]);
    }
    for (const match of source.matchAll(/(--jp-[a-z0-9-]+)\s*:/g)) {
      declared.add(match[1]);
    }
  }
  return [...used].filter((name) => !declared.has(name)).sort();
}

/** Every --jp-* name the package's own stylesheet declares. */
function bridgedVariables() {
  const source = fs.readFileSync(STYLESHEET, "utf8");
  return new Set([...source.matchAll(/(--jp-[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

describe("the widget stylesheets", () => {
  afterEach(() => {
    disposeWidgetStyles();
  });

  it("declares every --jp-* variable the vendor stylesheets rely on", () => {
    const bridged = bridgedVariables();
    const missing = requiredVariables().filter((name) => !bridged.has(name));

    expect(missing).toEqual([]);
  });

  it("has something to check", () => {
    // Guard the guard: a broken read would make the test above pass vacuously.
    expect(requiredVariables().length).toBeGreaterThan(20);
  });

  it("derives every bridged variable from the theme rather than a literal", () => {
    const source = fs.readFileSync(STYLESHEET, "utf8");
    const literals = [...source.matchAll(/(--jp-[a-z0-9-]+)\s*:\s*([^;]+);/g)]
      .filter(([, name]) => !name.startsWith("--jp-widgets-"))
      .filter(([, , value]) => !/var\(|color-mix\(|hsl\(/.test(value))
      // A bare length is not a theme colour and needs no derivation.
      .filter(([, , value]) => !/^\s*[\d.]+(px|em|rem|%)\s*$/.test(value));

    expect(literals.map(([, name]) => name)).toEqual([]);
  });

  describe("scoping", () => {
    it("rewrites :root rather than dropping it", () => {
      // widgets-base.css declares thirty-five of its own --jp-widgets-*
      // variables under :root. Dropping the rule would take the sizing of every
      // control with it.
      const scoped = scopeStylesheet(":root {\n  --jp-widgets-margin: 2px;\n}");

      expect(scoped).toContain(`${SCOPE} {`);
      expect(scoped).not.toContain(":root");
      expect(scoped).toContain("--jp-widgets-margin: 2px;");
    });

    it("rewrites :root inside a selector list", () => {
      const scoped = scopeStylesheet("body,\n:root {\n  color: red;\n}");

      expect(scoped).not.toContain(":root");
      expect(scoped).toContain(SCOPE);
    });

    it("drops @import, since the files are concatenated in order", () => {
      const scoped = scopeStylesheet("@import './lumino.css';\n.widget-box { color: red; }");

      expect(scoped).not.toContain("@import");
      expect(scoped).toContain(".widget-box");
    });

    it("leaves ordinary rules alone", () => {
      const scoped = scopeStylesheet(".widget-slider .noUi-handle {\n  width: 16px;\n}");

      expect(scoped).toContain(".widget-slider .noUi-handle");
    });
  });

  describe("loading", () => {
    it("does not read the vendor stylesheets until asked", () => {
      // They are not in styles/, which the editor loads eagerly at activation.
      const stylesDir = path.join(__dirname, "..", "styles");
      const sheets = fs.readdirSync(stylesDir).filter((name) => name.endsWith(".css"));

      expect(sheets).toEqual(["jupyter-repl.css"]);
    });

    it("injects once, however often it is asked", () => {
      const before = lumine.styles.getStyleElements().length;

      ensureWidgetStyles();
      ensureWidgetStyles();
      ensureWidgetStyles();

      expect(lumine.styles.getStyleElements().length).toBe(before + 1);
    });

    it("takes the stylesheet away again", () => {
      const before = lumine.styles.getStyleElements().length;
      ensureWidgetStyles();

      disposeWidgetStyles();

      expect(lumine.styles.getStyleElements().length).toBe(before);
    });

    it("injects something that actually styles a control", () => {
      ensureWidgetStyles();
      const injected = lumine.styles
        .getStyleElements()
        .map((element) => element.textContent)
        .join("\n");

      expect(injected).toContain(".widget-slider");
      // The theme it must not bring with it.
      expect(injected).not.toContain("--jp-layout-color1:");
    });
  });
});
