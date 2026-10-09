const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

describe("Kernel discovery property-shaped names", () => {
  let directory, previousJupyterPath;
  beforeEach(() => {
    directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "kernel-name-")));
    previousJupyterPath = process.env.JUPYTER_PATH;
    process.env.JUPYTER_PATH = directory;
    for (const name of ["constructor", "toString", "__proto__", "lumine-owned-kernel-control"]) {
      const resource = path.join(directory, "kernels", name);
      fs.mkdirSync(resource, { recursive: true });
      fs.writeFileSync(
        path.join(resource, "kernel.json"),
        JSON.stringify({
          display_name: `Scratch ${name}`,
          language: "controlled-test-language",
          argv: ["controlled-not-launched", "{connection_file}"],
        }),
      );
    }
  });
  afterEach(async () => {
    if (previousJupyterPath === undefined) delete process.env.JUPYTER_PATH;
    else process.env.JUPYTER_PATH = previousJupyterPath;
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      throw new Error("Unsafe kernel discovery fixture cleanup");
    await fs.promises.rm(directory, { recursive: true, force: true });
  });
  for (const name of ["constructor", "toString", "__proto__", "lumine-owned-kernel-control"]) {
    it(`discovers the real directory named ${name} as an own result property`, async () => {
      const found = await require("../lib/kernelspecs").findAll();
      expect(Object.hasOwn(found, name)).toBe(true);
      expect(found[name]?.spec?.display_name).toBe(`Scratch ${name}`);
      expect(Object.getPrototypeOf(found)).toBe(Object.prototype);
    });
  }
});
