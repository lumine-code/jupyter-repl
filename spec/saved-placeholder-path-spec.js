const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Kernel bindings for saved placeholder-shaped paths", () => {
  let directory, temporaryRoot, editors, store, Kernel, KernelTransport, kernels;
  beforeEach(async () => {
    jasmine.useRealClock();
    temporaryRoot = fs.realpathSync.native(os.tmpdir());
    directory = fs.realpathSync.native(
      fs.mkdtempSync(path.join(temporaryRoot, "kernel-path-owned-")),
    );
    editors = [];
    kernels = [];
    await lumine.packages.activatePackage("jupyter-repl");
    store = require("../lib/store");
    Kernel = require("../lib/kernel");
    KernelTransport = require("../lib/kernel-transport");
  });
  afterEach(async () => {
    for (const editor of editors) editor.destroy();
    for (const kernel of kernels) {
      store.deleteKernel(kernel);
      kernel.destroy();
    }
    await lumine.packages.deactivatePackage("jupyter-repl");
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(temporaryRoot, directory);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
      throw Error("Kernel path fixture escaped its root");
    await fs.promises.rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });
  async function openSaved(name) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "print('saved')\n");
    const editor = await lumine.workspace.open(file);
    editors.push(editor);
    return editor;
  }
  function bind(editor) {
    const transport = new KernelTransport(
      { name: "python3", language: "python", display_name: "Python" },
      editor.getGrammar(),
    );
    transport.setLifecycle("ready");
    transport.setExecutionState("idle");
    const kernel = new Kernel(transport);
    kernels.push(kernel);
    const file = editor.getPath() || `Unsaved Editor ${editor.id}`;
    store.newKernel(kernel, file, editor, editor.getGrammar());
    return kernel;
  }
  it("keeps an ordinary saved file bound after its editor is closed", async () => {
    const editor = await openSaved("ordinary.py"),
      file = editor.getPath(),
      kernel = bind(editor);
    editor.destroy();
    expect(store.getFilesForKernel(kernel)).toContain(file);
  });
  it("keeps a saved placeholder-shaped basename bound after the editor is closed", async () => {
    const editor = await openSaved("Unsaved Editor 12345.py"),
      file = editor.getPath(),
      kernel = bind(editor);
    editor.destroy();
    expect(store.getFilesForKernel(kernel)).toContain(file);
    expect(store.runningKernels).toContain(kernel);
  });
  it("watches the real saved path and removes its binding when it is deleted on disk", async () => {
    const editor = await openSaved(path.join("Unsaved Editor 12345", "script.py")),
      file = editor.getPath();
    const watchFile = lumine.fileWatchClient.watchFile.bind(lumine.fileWatchClient);
    let handle;
    const watch = spyOn(lumine.fileWatchClient, "watchFile").and.callFake((target) => {
      handle = watchFile(target);
      return handle;
    });
    const kernel = bind(editor);
    expect(watch).toHaveBeenCalledWith(file);
    if (!handle) return;
    await handle.ready;
    fs.unlinkSync(file);
    await globalThis.conditionPromise(() => !store.kernelMapping.has(file));
    expect(store.getFilesForKernel(kernel)).not.toContain(file);
    await handle.closed;
  });
  it("preserves a saved file's binding when the editor changes path without moving the old file", async () => {
    const editor = await openSaved("Unsaved Editor 12345.py"),
      file = editor.getPath(),
      kernel = bind(editor);
    editor.getBuffer().setPath(path.join(directory, "different.py"));
    editor.destroy();
    expect(fs.existsSync(file)).toBe(true);
    expect(store.getFilesForKernel(kernel)).toContain(file);
  });
  for (const name of ["normal.py", "Unsaved Editor 12345.py"]) {
    it(`remaps a true unsaved binding on save to ${name} and retains the saved binding on close`, async () => {
      const editor = await lumine.workspace.open();
      editors.push(editor);
      editor.setText("print('unsaved')\n");
      const placeholder = `Unsaved Editor ${editor.id}`,
        kernel = bind(editor);
      expect(store.getFilesForKernel(kernel)).toContain(placeholder);
      const saved = path.join(directory, name);
      await editor.saveAs(saved);
      expect(store.kernelMapping.has(placeholder)).toBe(false);
      expect(store.getFilesForKernel(kernel)).toContain(saved);
      editor.destroy();
      expect(store.getFilesForKernel(kernel)).toContain(saved);
    });
  }
});
