/**
 * Discovery of the Jupyter kernels installed on this machine.
 *
 * Replaces nteract's `kernelspecs`, abandoned in 2021. Only
 * `findAll` was ever used here, so `find`, `getKernelInfos` and
 * `getKernelResources` are not carried over. The per-kernel `files` listing of
 * the original is dropped as well: nothing consumed it, and producing it cost a
 * `readdir` of every kernel directory on every scan.
 *
 * @see https://jupyter-client.readthedocs.io/en/stable/kernels.html#kernel-specs
 */

const fs = require("fs");
const path = require("path");

const { dataDirs } = require("./jupyter-paths");

/**
 * Reads one kernel directory.
 *
 * @param  {string} name         the kernel's name, i.e. its directory name
 * @param  {string} resourceDir  the directory holding its kernel.json
 * @return {Promise<?Object>}    the kernel, or null when it is not one
 */
async function readKernel(name, resourceDir) {
  try {
    const data = await fs.promises.readFile(path.join(resourceDir, "kernel.json"), "utf8");
    const spec = JSON.parse(data);
    if (!spec || Array.isArray(spec) || typeof spec !== "object") return null;
    if (typeof spec.display_name !== "string" || !spec.display_name.trim()) return null;
    return { name, resources_dir: resourceDir, spec };
  } catch {
    // A directory without a readable, parseable kernel.json is simply not a
    // kernel. Unreadable entries are skipped rather than failing the scan, so
    // one broken install cannot hide every other kernel on the system.
    return null;
  }
}

/**
 * Lists the candidate kernel directories under a single Jupyter data directory.
 *
 * @param  {string} dataDir
 * @return {Promise<Array<{name: string, resourceDir: string}>>}
 */
async function readKernelDir(dataDir) {
  const kernelsDir = path.join(dataDir, "kernels");
  let entries;
  try {
    entries = await fs.promises.readdir(kernelsDir, { withFileTypes: true });
  } catch {
    // Most data dirs on a given machine have no kernels/ at all.
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => ({ name: entry.name, resourceDir: path.join(kernelsDir, entry.name) }));
}

/**
 * Every kernel installed on this machine, keyed by name. Matches the shape of
 * Jupyter's own kernelspecs API.
 *
 * Where the same kernel name appears in several data directories the first one
 * wins, so a user-installed kernel shadows a system-wide one of the same name.
 *
 * @return {Promise<Object<string, {name: string, resources_dir: string, spec: Object}>>}
 */
async function findAll() {
  const dirs = dataDirs();
  const candidates = (await Promise.all(dirs.map(readKernelDir))).flat();
  const kernels = await Promise.all(
    candidates.map(({ name, resourceDir }) => readKernel(name, resourceDir)),
  );

  const found = {};
  for (const kernel of kernels) {
    // Order is preserved by Promise.all, so the first hit is the one from the
    // earliest data directory.
    if (kernel && !Object.hasOwn(found, kernel.name)) {
      Object.defineProperty(found, kernel.name, {
        value: kernel,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }
  return found;
}

module.exports = {
  findAll,
};
