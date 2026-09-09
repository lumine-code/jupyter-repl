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
    store.kernelMapping.delete(filePath);
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
});
