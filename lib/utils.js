const { Disposable } = require("lumine");
const os = require("os");
const path = require("path");
const Config = require("./config");

const OUTPUT_AREA_URI = "lumine://jupyter-repl/output-area";

// Import execution time utilities from shared module
const { NO_EXECTIME_STRING, executionTime, formatElapsedTime } = require("./execution-time");

/**
 * Close the autocomplete suggestion popup of an editor before running code.
 * A run command that does not move the cursor would otherwise leave the
 * popup open, and it would have to be dismissed manually.
 */
function cancelAutocomplete(editor) {
  if (!editor?.element) return;
  lumine.commands.dispatch(editor.element, "autocomplete:cancel");
}

/**
 * Replace home directory in path with tilde (~)
 * Replacement for tildify-commonjs package
 */
function tildify(absolutePath) {
  const homeDir = os.homedir();
  if (!absolutePath || !homeDir) {
    return absolutePath;
  }
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  const normalizedHome = homeDir.replace(/\\/g, "/");

  if (normalizedPath === normalizedHome) {
    return "~";
  }

  // Ensure home directory ends with separator for proper prefix matching
  const homeWithSep = normalizedHome.endsWith("/") ? normalizedHome : normalizedHome + "/";

  if (normalizedPath.startsWith(homeWithSep)) {
    return "~/" + normalizedPath.slice(homeWithSep.length);
  }

  return absolutePath;
}

function focus(item) {
  if (item && typeof item === "object") {
    const editorPane = lumine.workspace.paneForItem(item);
    if (editorPane) {
      editorPane.activate();
    }
  }
}

function terminateEditorPendingState(editor) {
  if (!editor || editor.isDestroyed?.()) {
    return;
  }

  const pane = lumine.workspace.paneForItem(editor);
  if (pane?.getPendingItem?.() === editor) {
    pane.clearPendingItem();
    return;
  }

  editor.terminatePendingState?.();
}

async function openOrShowDock(URI) {
  // lumine.workspace.open(URI) will activate/focus the dock by default
  // dock.toggle() or dock.show() will leave focus wherever it was
  // this function is basically workspace.open, except it
  // will not focus the newly opened pane
  let dock = lumine.workspace.paneContainerForURI(URI);

  if (dock && typeof dock.show === "function") {
    // If the target item already exist, activate it and show dock
    const pane = lumine.workspace.paneForURI(URI);
    if (pane) {
      pane.activateItemForURI(URI);
    }
    return dock.show();
  }

  await lumine.workspace.open(URI, {
    searchAllPanes: true,
    activatePane: false,
  });
  dock = lumine.workspace.paneContainerForURI(URI);
  return dock && typeof dock.show === "function" ? dock.show() : null;
}

// Grammar names that are dialects of another kernel language. The IPython
// grammar (the .ipy tree-sitter grammar bundled with Lumine) runs on regular
// python kernels. User `languageMappings` take precedence over these.
const grammarLanguageAliases = {
  ipython: "python",
};

function grammarToLanguage(grammar) {
  if (!grammar) {
    return null;
  }
  const grammarLanguage = grammar.name.toLowerCase();
  const mappings = Config.getJson("languageMappings");

  const kernelLanguage = Object.keys(mappings).find(
    (key) => mappings[key].toLowerCase() === grammarLanguage,
  );
  if (kernelLanguage) {
    return kernelLanguage.toLowerCase();
  }

  return grammarLanguageAliases[grammarLanguage] || grammarLanguage;
}

// Import msgSpecToNotebookFormat from shared module
const { msgSpecToNotebookFormat } = require("./output-utils");

const markupGrammars = new Set([
  "source.gfm",
  "source.asciidoc",
  "text.restructuredtext",
  "text.tex.latex.knitr",
  "text.md",
  "source.weave.noweb",
  "source.weave.md",
  "source.weave.latex",
  "source.weave.restructuredtext",
  "source.pweave.noweb",
  "source.pweave.md",
  "source.pweave.latex",
  "source.pweave.restructuredtext",
  "source.dyndoc.md.stata",
  "source.dyndoc.latex.stata",
]);

function isMultilanguageGrammar(grammar) {
  return markupGrammars.has(grammar.scopeName);
}

const isUnsavedFilePath = (filePath) => {
  return filePath.match(/Unsaved\sEditor\s\d+/) ? true : false;
};

function kernelSpecProvidesGrammar(kernelSpec, grammar) {
  if (!grammar || !grammar.name || !kernelSpec || !kernelSpec.language) {
    return false;
  }

  const grammarLanguage = grammar.name.toLowerCase();
  const kernelLanguage = kernelSpec.language.toLowerCase();

  if (kernelLanguage === grammarLanguage) {
    return true;
  }

  const mappedLanguage = Config.getJson("languageMappings")[kernelLanguage];
  if (mappedLanguage && mappedLanguage.toLowerCase() === grammarLanguage) {
    return true;
  }

  return grammarLanguageAliases[grammarLanguage] === kernelLanguage;
}

function getEmbeddedScope(editor, position) {
  const scopes = editor.scopeDescriptorForBufferPosition(position).getScopesArray();
  return scopes.find((s, i) => {
    return i > 0 ? s.indexOf("source.") === 0 : false;
  });
}

function getEditorDirectory(editor) {
  if (!editor) {
    return os.homedir();
  }
  const editorPath = editor.getPath();
  return editorPath ? path.dirname(editorPath) : os.homedir();
}

// Read once and kept current, rather than per call: `log` sits on the per-iopub
// -message path, where a config lookup for every message of every stream adds up.
let debugEnabled = false;

/**
 * Start tracking the debug setting. Called from `activate`, whose subscriptions
 * own the result — this module cannot reach the store to own it itself.
 *
 * Disposing clears the flag as well as the subscription: the module outlives
 * deactivation, so a flag left set would keep a torn-down package logging.
 * @returns {Disposable}
 */
function observeDebugSetting() {
  const subscription = lumine.config.observe("jupyter-repl.debug", (value) => {
    debugEnabled = Boolean(value);
  });

  return new Disposable(() => {
    subscription.dispose();
    debugEnabled = false;
  });
}

function log(...message) {
  if (debugEnabled) {
    console.log("jupyter-repl:", ...message);
  }
}

function hotReloadPackage() {
  const packName = "jupyter-repl";
  const packPath = lumine.packages.resolvePackagePath(packName);
  if (!packPath) {
    return;
  }
  const packPathPrefix = packPath + path.sep;
  const zeromqPathPrefix = path.join(packPath, "node_modules", "zeromq") + path.sep;
  log(`deactivating ${packName}`);
  lumine.packages.deactivatePackage(packName);
  lumine.packages.unloadPackage(packName);

  // Delete require cache to re-require on activation.
  // But except zeromq native module which is not re-requireable.
  const packageLibsExceptZeromq = (filePath) =>
    filePath.startsWith(packPathPrefix) && !filePath.startsWith(zeromqPathPrefix);

  Object.keys(require.cache)
    .filter(packageLibsExceptZeromq)
    .forEach((filePath) => delete require.cache[filePath]);
  lumine.packages.loadPackage(packName);
  lumine.packages.activatePackage(packName);
  log(`activated ${packName}`);
}

function rowRangeForCodeFoldAtBufferRow(editor, row) {
  const range = editor.getFoldableRangeAtBufferRow(row);
  return range ? [range.start.row, range.end.row] : null;
}

// Building one of these costs about as much as segmenting a short line, and it
// carries no state between calls, so the completion path shares a single one.
let graphemeSegmenter = null;

function segmentsOf(text) {
  graphemeSegmenter ??= new Intl.Segmenter("en", { granularity: "grapheme" });
  return [...graphemeSegmenter.segment(text)];
}

// A grapheme index equals a code-unit index for text with no character above
// U+007F, which every ASCII identifier is — and the completion path converts
// twice per match, so a 300-match reply would otherwise segment the prefix 600
// times over. Anything else falls through and is segmented as before.
function isAscii(text) {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) {
      return false;
    }
  }
  return true;
}

/**
 * Convert JavaScript string index to character index, handling Unicode properly.
 * Uses Intl.Segmenter for proper grapheme cluster handling.
 *
 * @param {Number} js_idx - JavaScript string index (UTF-16 code units)
 * @param {String} text - The text string
 * @returns {Number} - Character index (grapheme clusters)
 */
function js_idx_to_char_idx(js_idx, text) {
  if (text === null || js_idx < 0) {
    return -1;
  }
  if (isAscii(text)) {
    return js_idx > text.length ? text.length : js_idx;
  }

  const segments = segmentsOf(text);

  // Find which grapheme the js_idx falls into
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const endIndex = nextSegment?.index ?? text.length;

    if (js_idx >= segment.index && js_idx < endIndex) {
      return i;
    }
  }

  return segments.length;
}

/**
 * Convert character index to JavaScript string index, handling Unicode properly.
 * Uses Intl.Segmenter for proper grapheme cluster handling.
 *
 * @param {Number} char_idx - Character index (grapheme clusters)
 * @param {String} text - The text string
 * @returns {Number} - JavaScript string index (UTF-16 code units)
 */
function char_idx_to_js_idx(char_idx, text) {
  if (text === null || char_idx < 0) {
    return -1;
  }
  if (isAscii(text)) {
    return char_idx >= text.length ? text.length : char_idx;
  }

  const segments = segmentsOf(text);

  // If char_idx exceeds the number of graphemes, return text length
  if (char_idx >= segments.length) {
    return text.length;
  }

  // Find the JS string index at the char_idx-th grapheme
  return segments[char_idx]?.index ?? text.length;
}

module.exports = {
  OUTPUT_AREA_URI,
  cancelAutocomplete,
  tildify,
  focus,
  terminateEditorPendingState,
  grammarToLanguage,
  isMultilanguageGrammar,
  isUnsavedFilePath,
  kernelSpecProvidesGrammar,
  getEmbeddedScope,
  getEditorDirectory,
  log,
  observeDebugSetting,
  hotReloadPackage,
  rowRangeForCodeFoldAtBufferRow,
  js_idx_to_char_idx,
  char_idx_to_js_idx,
  openOrShowDock,
  NO_EXECTIME_STRING,
  msgSpecToNotebookFormat,
  executionTime,
  formatElapsedTime,
};
