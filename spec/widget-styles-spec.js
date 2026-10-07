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
// whole --jp-* palette on :root, hard-coded light, so styles/main.css
// supplies those names from the active Lumine theme instead.
//
// The load-bearing test is the first one. A widget whose stylesheet references
// a --jp-* name nothing declares does not fail loudly — it renders with the
// property unset, which for a slider means an invisible track and for a button
// means no colour at all. An ipywidgets upgrade that introduces a variable must
// fail here rather than in someone's editor.

const STYLESHEET = path.join(__dirname, "..", "styles", "main.css");

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

      expect(sheets).toEqual(["main.css"]);
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

  describe("theme color pairs in rendered controls", () => {
    let host;
    let bridge;
    let palette;

    function channels(value) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d");
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    }

    beforeEach(() => {
      ensureWidgetStyles();
      bridge = lumine.styles.addStyleSheet(fs.readFileSync(STYLESHEET, "utf8"), { priority: 0 });
      host = document.createElement("div");
      host.className = "jupyter-repl";
      jasmine.attachToDOM(host);
    });

    afterEach(() => {
      host.remove();
      bridge.dispose();
      palette?.dispose();
      palette = null;
      lumine.config.set("theme.accentSource", "theme");
      lumine.themes.systemAccentColor = null;
      lumine.themes.applyAccentColor();
    });

    it("keeps strong and muted widget text on the syntax palette in mixed UI and syntax themes", () => {
      host.innerHTML =
        '<div class="jupyter-widget-taginput">Tags</div><div class="jupyter-widget-Collapse-header">Header</div>';
      for (const [ui, syntax, background, muted] of [
        ["white", "rgb(16, 32, 48)", "white", [112, 121, 131, 255]],
        ["black", "rgb(240, 240, 240)", "rgb(16, 32, 48)", [150, 157, 163, 255]],
      ]) {
        palette = lumine.styles.addStyleSheet(
          `:root { --text-color: ${ui}; --text-color-subtle: ${ui}; --syntax-text-color: ${syntax}; --syntax-background-color: ${background}; }`,
          { priority: 2 },
        );
        expect(getComputedStyle(host.firstElementChild).color).toBe(syntax);
        expect(channels(getComputedStyle(host.lastElementChild).color)).toEqual(muted);
        palette.dispose();
        palette = null;
      }
    });

    it("pairs status button and tag text with their fills independently of system accents", async () => {
      palette = lumine.styles.addStyleSheet(
        `:root {
          --background-color-success: rgb(232, 249, 165);
          --background-color-info: rgb(184, 215, 250);
          --background-color-warning: rgb(249, 237, 172);
          --background-color-error: rgb(54, 34, 17);
          --text-color-success: rgb(1, 2, 3);
          --text-color-info: rgb(2, 3, 4);
          --text-color-warning: rgb(3, 4, 5);
          --text-color-error: rgb(4, 5, 6);
          --text-color-on-success: rgb(20, 30, 40);
          --text-color-on-info: rgb(30, 40, 50);
          --text-color-on-warning: rgb(40, 50, 60);
          --text-color-on-error: rgb(210, 220, 230);
        }`,
        { priority: 2 },
      );
      spyOn(lumine.themes.applicationDelegate, "invokeApp").and.returnValue(
        Promise.resolve("#123456"),
      );
      lumine.config.set("theme.accentSource", "system");
      await lumine.themes.refreshSystemAccentColor();

      for (const [kind, foreground, background, activeForeground, activeBackground] of [
        ["success", "rgb(20, 30, 40)", "rgb(232, 249, 165)", [0, 0, 0, 255], [186, 199, 132, 255]],
        ["info", "rgb(30, 40, 50)", "rgb(184, 215, 250)", [0, 0, 0, 255], [147, 172, 200, 255]],
        ["warning", "rgb(40, 50, 60)", "rgb(249, 237, 172)", [0, 0, 0, 255], [199, 190, 138, 255]],
        [
          "danger",
          "rgb(210, 220, 230)",
          "rgb(54, 34, 17)",
          [255, 255, 255, 255],
          [43, 27, 14, 255],
        ],
      ]) {
        for (const className of ["jupyter-button", "jupyter-widget-tag"]) {
          const item = document.createElement(className === "jupyter-button" ? "button" : "div");
          item.className = `${className} mod-${kind}`;
          item.textContent = kind;
          host.appendChild(item);
          expect(getComputedStyle(item).color).withContext(item.className).toBe(foreground);
          expect(getComputedStyle(item).backgroundColor).toBe(background);
          if (item.tagName === "BUTTON") {
            item.focus();
            expect(getComputedStyle(item).color).toBe(foreground);
            expect(getComputedStyle(item).backgroundColor).toBe(background);
          }
          item.classList.add("mod-active");
          expect(channels(getComputedStyle(item).color)).toEqual(activeForeground);
          expect(channels(getComputedStyle(item).backgroundColor)).toEqual(activeBackground);
          item.remove();
        }
      }
    });
  });
});
