const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const store = require("../lib/store");

describe("kernel mapping file observation", () => {
  let directory, filePath, handle;
  beforeEach(() => {
    jasmine.useRealClock();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-file-watch-"));
    filePath = path.join(directory, "notebook.py");
    fs.writeFileSync(filePath, "print('saved')\n");
    const watchFile = lumine.fileWatchClient.watchFile.bind(lumine.fileWatchClient);
    spyOn(lumine.fileWatchClient, "watchFile").and.callFake((target) => {
      handle = watchFile(target);
      return handle;
    });
  });
  afterEach(async () => {
    handle?.dispose();
    await handle?.closed;
    store.removeKernelKey(filePath);
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  it("drops the original filename mapping when that file is renamed away", async () => {
    store.kernelMapping.set(filePath, {});
    store.addFileDisposer(null, filePath);
    await handle.ready;
    fs.renameSync(filePath, path.join(directory, "renamed.py"));
    await globalThis.conditionPromise(() => !store.kernelMapping.has(filePath));
    expect(handle.path).toBe(filePath);
    await handle.closed;
  });

  it("keeps one watcher per file when a kernel is rebound", async () => {
    store.kernelMapping.set(filePath, {});
    store.addFileDisposer(null, filePath);
    store.addFileDisposer(null, filePath);
    expect(lumine.fileWatchClient.watchFile).toHaveBeenCalledTimes(1);
    await handle.ready;
  });

  it("closes the watcher as soon as its mapping is removed", async () => {
    store.kernelMapping.set(filePath, {});
    store.addFileDisposer(null, filePath);
    await handle.ready;
    store.removeKernelKey(filePath);
    await handle.closed;
    expect(store.fileDisposers.has(filePath)).toBe(false);
  });

  it("closes the watcher when the final grammar's kernel is removed", async () => {
    const kernel = { grammar: { name: "Python" } };
    store.kernelMapping.set(filePath, new Map([["Python", kernel]]));
    store.runningKernels.push(kernel);
    store.addFileDisposer(null, filePath);
    await handle.ready;
    store.deleteKernel(kernel);
    await handle.closed;
    expect(store.kernelMapping.has(filePath)).toBe(false);
    expect(store.fileDisposers.has(filePath)).toBe(false);
  });
});
