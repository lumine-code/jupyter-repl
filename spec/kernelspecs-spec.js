const fs = require("fs");
const os = require("os");
const path = require("path");

const { findAll } = require("../lib/kernelspecs");
const { dataDirs, runtimeDir, resetSysPrefixCache } = require("../lib/jupyter-paths");

// Kernel discovery used to come from nteract's `kernelspecs`/`jupyter-paths`,
// which were abandoned in 2021 and probed directories with the runtime
// deprecated `fs.X_OK`. These specs pin the behaviour the replacement has to
// keep: the search-path assembly, the kernel.json parsing, and the precedence
// rule that lets a user-installed kernel shadow a system-wide one.
describe("kernel discovery", () => {
  let root;
  const savedEnv = {};

  // dataDirs() reads the environment, so each case gets a clean slate and the
  // real machine's Jupyter install is kept out of the results.
  const ENV_KEYS = ["JUPYTER_PATH", "JUPYTER_RUNTIME_DIR", "XDG_RUNTIME_DIR"];

  function writeKernel(dataDir, name, spec) {
    const resourceDir = path.join(dataDir, "kernels", name);
    fs.mkdirSync(resourceDir, { recursive: true });
    fs.writeFileSync(path.join(resourceDir, "kernel.json"), spec);
    return resourceDir;
  }

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-repl-kernels-")));
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    resetSysPrefixCache();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    resetSysPrefixCache();
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  describe("dataDirs", () => {
    it("puts JUPYTER_PATH ahead of the user data directory", () => {
      process.env.JUPYTER_PATH = root;
      const dirs = dataDirs();
      expect(dirs[0]).toBe(root);
      expect(dirs.length).toBeGreaterThan(1);
    });

    it("treats JUPYTER_PATH as a delimiter-separated list", () => {
      const second = path.join(root, "second");
      process.env.JUPYTER_PATH = [root, second].join(path.delimiter);
      const dirs = dataDirs();
      expect(dirs[0]).toBe(root);
      expect(dirs[1]).toBe(second);
    });

    it("returns absolute paths only", () => {
      for (const dir of dataDirs()) {
        expect(path.isAbsolute(dir)).toBe(true);
      }
    });
  });

  describe("runtimeDir", () => {
    it("prefers JUPYTER_RUNTIME_DIR", () => {
      process.env.JUPYTER_RUNTIME_DIR = root;
      expect(runtimeDir()).toBe(root);
    });

    it("falls back to a runtime directory under the user data directory", () => {
      expect(path.basename(runtimeDir())).toBe("runtime");
    });
  });

  // findAll() searches the whole machine, and the machine running these specs
  // may well have Jupyter kernels installed. So the fixtures use names no real
  // install would claim, and the assertions look for those names rather than
  // for an exact set.
  describe("findAll", () => {
    const ALPHA = "jupyter-spec-alpha";
    const BETA = "jupyter-spec-beta";

    it("reads every kernel.json below a data directory", async () => {
      writeKernel(root, ALPHA, JSON.stringify({ display_name: "Alpha", argv: ["alpha"] }));
      writeKernel(root, BETA, JSON.stringify({ display_name: "Beta", argv: ["beta"] }));
      process.env.JUPYTER_PATH = root;

      const found = await findAll();

      expect(found[ALPHA].spec.display_name).toBe("Alpha");
      expect(found[ALPHA].spec.argv).toEqual(["alpha"]);
      expect(found[ALPHA].name).toBe(ALPHA);
      expect(found[ALPHA].resources_dir).toBe(path.join(root, "kernels", ALPHA));
      expect(found[BETA].spec.display_name).toBe("Beta");
    });

    it("skips directories that hold no kernel.json", async () => {
      fs.mkdirSync(path.join(root, "kernels", BETA), { recursive: true });
      writeKernel(root, ALPHA, JSON.stringify({ display_name: "Alpha" }));
      process.env.JUPYTER_PATH = root;

      const found = await findAll();

      expect(found[BETA]).toBeUndefined();
      expect(found[ALPHA]).toBeDefined();
    });

    it("skips a malformed kernel.json without losing the others", async () => {
      writeKernel(root, BETA, "{ this is not json");
      writeKernel(root, ALPHA, JSON.stringify({ display_name: "Alpha" }));
      process.env.JUPYTER_PATH = root;

      const found = await findAll();

      // One broken install must not hide every other kernel on the machine.
      expect(found[BETA]).toBeUndefined();
      expect(found[ALPHA]).toBeDefined();
    });

    it("skips valid JSON that cannot describe a kernel", async () => {
      for (const [suffix, data] of [
        ["null", "null"],
        ["array", "[]"],
        ["number", "123"],
        ["unnamed", "{}"],
        ["invalid-name", '{"display_name": 1}'],
      ]) {
        writeKernel(root, `${BETA}-${suffix}`, data);
      }
      writeKernel(root, ALPHA, JSON.stringify({ display_name: "Alpha" }));
      process.env.JUPYTER_PATH = root;
      const found = await findAll();
      expect(found[ALPHA]).toBeDefined();
      expect(Object.keys(found).filter((name) => name.startsWith(BETA))).toEqual([]);
    });

    it("resolves without throwing when a data directory does not exist", async () => {
      process.env.JUPYTER_PATH = path.join(root, "nonexistent");
      const found = await findAll();
      expect(found[ALPHA]).toBeUndefined();
    });

    it("lets an earlier data directory shadow a later one of the same name", async () => {
      const preferred = path.join(root, "preferred");
      const fallback = path.join(root, "fallback");
      writeKernel(preferred, ALPHA, JSON.stringify({ display_name: "Preferred" }));
      writeKernel(fallback, ALPHA, JSON.stringify({ display_name: "Fallback" }));
      process.env.JUPYTER_PATH = [preferred, fallback].join(path.delimiter);

      const found = await findAll();

      expect(found[ALPHA].spec.display_name).toBe("Preferred");
    });
  });
});
