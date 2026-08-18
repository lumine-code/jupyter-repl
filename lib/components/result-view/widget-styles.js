const fs = require("fs");
const path = require("path");

// The ipywidgets stylesheets, loaded on first use.
//
// They are read from node_modules rather than vendored, so an ipywidgets
// upgrade is picked up with the packages rather than by hand, and nothing
// third-party enters the repository. They are not in styles/ because the editor
// loads that directory eagerly at activation, and a window that never opens a
// kernel should not parse five thousand lines of widget CSS.
//
// The controls are unusable without this — sliders, dropdowns and box layouts
// are entirely CSS — so unlike the MathJax and Plotly precedents there is
// nothing to restate by hand. What is restated instead is the *theme*: the
// upstream labvariables.css is deliberately not loaded, because it declares
// JupyterLab's --jp-* palette on :root, which is both global pollution and a
// hard-coded light theme. styles/main.css supplies those names from the
// active Lumine theme instead.

// In load order. widgets-base.css imports lumino and nouislider; base/index.css
// stands alone; labvariables.css is the theme and is replaced.
const SOURCES = [
  ["@jupyter-widgets/base", "css/index.css"],
  ["@jupyter-widgets/controls", "css/lumino.css"],
  ["@jupyter-widgets/controls", "css/nouislider.css"],
  ["@jupyter-widgets/controls", "css/widgets-base.css"],
];

// The scope the rewritten :root rules land on, and the element the bridge
// block in styles/main.css declares the --jp-* names on.
const SCOPE = ".jupyter-repl";

let disposable = null;

/**
 * Resolve one stylesheet inside an installed package.
 * @returns {String} The file's contents, or "" if it is not there.
 */
function readSource(packageName, relativePath) {
  try {
    // Resolved through the manifest rather than by joining a path, so a
    // hoisted or nested install both work.
    const manifest = require.resolve(`${packageName}/package.json`);
    return fs.readFileSync(path.join(path.dirname(manifest), relativePath), "utf8");
  } catch (error) {
    console.error(`[jupyter-repl] Could not read ${packageName}/${relativePath}:`, error.message);
    return "";
  }
}

/**
 * Make a vendor stylesheet safe to inject into the editor.
 *
 * `@import` goes because the files are concatenated here in the same order.
 * `:root` is rewritten rather than dropped: widgets-base.css declares
 * thirty-five of its own --jp-widgets-* variables there, so removing the rule
 * would take the sizing of every control with it. Rewriting scopes them
 * alongside the ones the theme bridge supplies.
 */
function scopeStylesheet(source) {
  return source
    .replace(/^\s*@import[^;]+;\s*$/gm, "")
    .replace(/(^|[\s,}])(:root)\b/g, `$1${SCOPE}`);
}

/**
 * Load the widget stylesheets, once. Idempotent and cheap after the first call.
 * @returns {Disposable}
 */
function ensureWidgetStyles() {
  if (disposable) {
    return disposable;
  }
  const source = SOURCES.map(([pkg, file]) => scopeStylesheet(readSource(pkg, file))).join("\n");
  disposable = lumine.styles.addStyleSheet(source, {
    sourcePath: "jupyter-repl-widgets",
    // Before the package's own sheet, so styles/main.css wins at equal
    // specificity — the same relationship the Plotly overrides rely on.
    priority: -1,
  });
  return disposable;
}

function disposeWidgetStyles() {
  disposable?.dispose();
  disposable = null;
}

module.exports = { ensureWidgetStyles, disposeWidgetStyles, scopeStylesheet, SOURCES, SCOPE };
