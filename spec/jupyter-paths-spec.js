const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

describe("Jupyter data paths across platforms", () => {
  let source;

  beforeEach(() => {
    source = fs.readFileSync(path.join(__dirname, "../lib/jupyter-paths.js"), "utf8");
  });

  function pathsFor(platform, env = {}) {
    const nativePath = platform === "win32" ? path.win32 : path.posix;
    const home = platform === "win32" ? "C:\\Users\\jupyter-test" : "/home/jupyter-test";
    const module = { exports: {} };
    vm.runInNewContext(
      source,
      {
        module,
        exports: module.exports,
        process: { platform, env: { PATH: "", ...env } },
        require(name) {
          if (name === "fs") return fs;
          if (name === "os") return { homedir: () => home };
          if (name === "path") return nativePath;
          throw new Error(`Unexpected Jupyter paths dependency: ${name}`);
        },
      },
      { filename: "jupyter-paths.js" },
    );
    return module.exports;
  }

  it("uses an absolute Unix XDG data home for the Jupyter directory", () => {
    const paths = pathsFor("linux", { XDG_DATA_HOME: "/custom data/user" });

    expect(paths.userDataDir()).toBe("/custom data/user/jupyter");
  });

  it("falls back to the Unix home for unset, empty or nonabsolute XDG values", () => {
    for (const xdgHome of [undefined, "", "relative/data", "~/data", "C:\\data"]) {
      const env = xdgHome === undefined ? {} : { XDG_DATA_HOME: xdgHome };

      expect(pathsFor("linux", env).userDataDir()).toBe("/home/jupyter-test/.local/share/jupyter");
    }
  });

  it("lets an explicit Jupyter data directory override platform defaults and XDG", () => {
    for (const [platform, dataDir] of [
      ["linux", "/custom/jupyter-data"],
      ["darwin", "/custom/jupyter-data"],
      ["win32", "D:\\custom\\jupyter-data"],
    ]) {
      const paths = pathsFor(platform, {
        JUPYTER_DATA_DIR: dataDir,
        XDG_DATA_HOME: "/ignored/xdg",
        APPDATA: "C:\\ignored\\AppData",
      });

      expect(paths.userDataDir()).toBe(dataDir);
    }
  });

  it("treats an empty Jupyter data override as unset", () => {
    expect(
      pathsFor("linux", { JUPYTER_DATA_DIR: "", XDG_DATA_HOME: "/selected/xdg" }).userDataDir(),
    ).toBe("/selected/xdg/jupyter");
    expect(pathsFor("darwin", { JUPYTER_DATA_DIR: "" }).userDataDir()).toBe(
      "/home/jupyter-test/Library/Jupyter",
    );
    expect(pathsFor("win32", { JUPYTER_DATA_DIR: "" }).userDataDir()).toBe(
      "C:\\Users\\jupyter-test\\AppData\\Roaming\\jupyter",
    );
  });

  it("preserves the explicit Jupyter data override without expansion or an added suffix", () => {
    for (const dataDir of ["relative/jupyter-data", "~/jupyter-data", "/custom/jupyter-data/"]) {
      expect(pathsFor("linux", { JUPYTER_DATA_DIR: dataDir }).userDataDir()).toBe(dataDir);
    }
  });

  it("keeps the macOS Library default when only XDG data home is set", () => {
    expect(pathsFor("darwin", { XDG_DATA_HOME: "/ignored/xdg" }).userDataDir()).toBe(
      "/home/jupyter-test/Library/Jupyter",
    );
  });

  it("uses Windows AppData instead of XDG data home", () => {
    expect(
      pathsFor("win32", {
        APPDATA: "D:\\Profiles\\jupyter-test\\Roaming",
        XDG_DATA_HOME: "D:\\ignored\\xdg",
      }).userDataDir(),
    ).toBe("D:\\Profiles\\jupyter-test\\Roaming\\jupyter");
  });

  it("falls back to the Windows home when AppData is absent or empty", () => {
    for (const appData of [undefined, ""]) {
      const env = { XDG_DATA_HOME: "D:\\ignored\\xdg" };
      if (appData !== undefined) env.APPDATA = appData;

      expect(pathsFor("win32", env).userDataDir()).toBe(
        "C:\\Users\\jupyter-test\\AppData\\Roaming\\jupyter",
      );
    }
  });

  it("places the default runtime beneath the selected user data directory", () => {
    expect(pathsFor("linux", { XDG_DATA_HOME: "/selected/xdg" }).runtimeDir()).toBe(
      "/selected/xdg/jupyter/runtime",
    );
    expect(pathsFor("linux", { JUPYTER_DATA_DIR: "/selected/jupyter-data" }).runtimeDir()).toBe(
      "/selected/jupyter-data/runtime",
    );
    expect(pathsFor("darwin").runtimeDir()).toBe("/home/jupyter-test/Library/Jupyter/runtime");
    expect(pathsFor("win32", { JUPYTER_DATA_DIR: "D:\\selected\\jupyter-data" }).runtimeDir()).toBe(
      "D:\\selected\\jupyter-data\\runtime",
    );
  });

  it("preserves explicit and XDG runtime priority over the selected data directory", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      const nativePath = platform === "win32" ? path.win32 : path.posix;
      const env = {
        JUPYTER_DATA_DIR: nativePath.join(nativePath.sep, "data"),
        XDG_RUNTIME_DIR: nativePath.join(nativePath.sep, "xdg-runtime"),
        JUPYTER_RUNTIME_DIR: nativePath.join(nativePath.sep, "explicit-runtime"),
      };

      expect(pathsFor(platform, env).runtimeDir()).toBe(env.JUPYTER_RUNTIME_DIR);
      env.JUPYTER_RUNTIME_DIR = "";
      expect(pathsFor(platform, env).runtimeDir()).toBe(
        nativePath.join(env.XDG_RUNTIME_DIR, "jupyter"),
      );
      env.XDG_RUNTIME_DIR = "";
      expect(pathsFor(platform, env).runtimeDir()).toBe(
        nativePath.join(env.JUPYTER_DATA_DIR, "runtime"),
      );
    }
  });

  it("keeps each explicit search path before the chosen user data directory", () => {
    for (const platform of ["linux", "darwin", "win32"]) {
      const nativePath = platform === "win32" ? path.win32 : path.posix;
      const first = nativePath.join(nativePath.sep, "first");
      const second = nativePath.join(nativePath.sep, "second");
      const dataDir = nativePath.join(nativePath.sep, "selected-data");
      const paths = pathsFor(platform, {
        JUPYTER_PATH: [first, "", second].join(nativePath.delimiter),
        JUPYTER_DATA_DIR: dataDir,
        XDG_DATA_HOME: "/ignored/xdg",
      });

      expect(Array.from(paths.dataDirs()).slice(0, 3)).toEqual([first, second, dataDir]);
    }
  });
});
