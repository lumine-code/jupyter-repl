/**
 * Where Jupyter keeps its data and runtime files.
 *
 * Replaces nteract's `jupyter-paths`, which was abandoned in 2021 and reached
 * us only transitively, through `kernelspecs` and
 * `spawnteract`. Its last release still probes directories with the
 * runtime-deprecated `fs.X_OK`, and it pulled in `home-dir` for what is now
 * `os.homedir()`. Only `dataDirs` and `runtimeDir` were ever used here, so only
 * those are kept; upstream's `configDirs` and its `askJupyter` subprocess mode
 * have no callers in this package.
 *
 * @see https://jupyter.readthedocs.io/en/latest/use/jupyter-directories.html
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

// `guessSysPrefix` walks PATH looking for a python executable, which is
// unchanging for the life of the process and costs a stat per PATH entry, so
// resolve it at most once. `undefined` means "not computed", `null` means
// "computed, nothing found".
let sysPrefixGuess;

/**
 * True when `p` exists and is executable/listable by this process.
 */
function isAccessible(p) {
  try {
    // fs.constants.X_OK, not the fs.X_OK alias: the latter is runtime
    // deprecated (DEP0176) and slated for removal.
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    // Missing, or [WSA]EACCES.
    return false;
  }
}

/**
 * Inexpensive guess at Python's `sys.prefix`, based on the location of the
 * first `python` executable on PATH. Modelled on Python 3.5's `shutil.which`.
 *
 * @return {?string} the prefix, or null when no python is on PATH
 */
function guessSysPrefix() {
  if (sysPrefixGuess !== undefined) return sysPrefixGuess;
  sysPrefixGuess = null;

  const entries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  // On Windows an executable is only found by trying each PATHEXT suffix.
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT || "").split(path.delimiter) : [""];

  for (const entry of entries) {
    let bin;
    try {
      bin = path.resolve(entry);
    } catch {
      // A malformed PATH entry should not sink the whole scan.
      continue;
    }

    for (const extension of extensions) {
      const executable = path.join(bin, `python${extension}`);
      if (!isAccessible(executable)) continue;

      sysPrefixGuess =
        process.platform === "win32"
          ? // Windows lays it out as PREFIX\python.exe ...
            path.dirname(executable)
          : // ... everywhere else as PREFIX/bin/python.
            path.dirname(path.dirname(executable));
      return sysPrefixGuess;
    }
  }

  return sysPrefixGuess;
}

/**
 * System-wide data directories, which are not user-writable.
 *
 * @return {string[]}
 */
function systemDataDirs() {
  if (process.platform === "win32") {
    return process.env.PROGRAMDATA
      ? [path.resolve(path.join(process.env.PROGRAMDATA, "jupyter"))]
      : [];
  }
  return ["/usr/local/share/jupyter", "/usr/share/jupyter"];
}

/**
 * The user-level data directory, which holds the runtime files.
 *
 * @return {string}
 */
function userDataDir() {
  if (process.env.JUPYTER_DATA_DIR) return process.env.JUPYTER_DATA_DIR;
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Jupyter");
  }
  if (process.platform === "win32") {
    return process.env.APPDATA
      ? path.resolve(path.join(process.env.APPDATA, "jupyter"))
      : path.join(os.homedir(), "AppData", "Roaming", "jupyter");
  }
  // XDG base directories must be absolute; an unset, empty or relative value
  // uses the standard user-data location instead.
  const xdg = process.env.XDG_DATA_HOME;
  const dataHome = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".local", "share");
  return path.join(dataHome, "jupyter");
}

/**
 * Every directory Jupyter may keep data (and therefore kernelspecs) in, in
 * precedence order. Callers are expected to tolerate entries that do not exist.
 *
 * @return {string[]}
 */
function dataDirs() {
  const dirs = [];

  if (process.env.JUPYTER_PATH) {
    // A delimiter-separated list, like PATH itself. Upstream pushed the raw
    // value as a single directory, so a JUPYTER_PATH naming more than one
    // location silently found nothing.
    dirs.push(...process.env.JUPYTER_PATH.split(path.delimiter).filter(Boolean));
  }

  dirs.push(userDataDir());

  const systemDirs = systemDataDirs();

  // Kernels installed into the active virtualenv/conda env live under the
  // python prefix rather than either of the locations above.
  const sysPrefix = guessSysPrefix();
  if (sysPrefix) {
    const sysPrefixed = path.join(sysPrefix, "share", "jupyter");
    if (!systemDirs.includes(sysPrefixed)) {
      dirs.push(sysPrefixed);
    }
  }

  return dirs.concat(systemDirs);
}

/**
 * Where kernel connection files are written. Not guaranteed to exist yet — the
 * caller creates it.
 *
 * @return {string}
 */
function runtimeDir() {
  if (process.env.JUPYTER_RUNTIME_DIR) {
    return process.env.JUPYTER_RUNTIME_DIR;
  }
  if (process.env.XDG_RUNTIME_DIR) {
    return path.join(process.env.XDG_RUNTIME_DIR, "jupyter");
  }
  return path.join(userDataDir(), "runtime");
}

/**
 * Drops the memoized `sys.prefix` guess. Only used by the specs, which need to
 * vary PATH between cases.
 */
function resetSysPrefixCache() {
  sysPrefixGuess = undefined;
}

module.exports = {
  userDataDir,
  dataDirs,
  runtimeDir,
  resetSysPrefixCache,
};
