const fs = require("fs");
const os = require("os");
const path = require("path");
const Kernel = require("../lib/kernel");

// The package puts a `jupyter-kernel` class on every editor whose file has a
// running kernel, so styles and keymaps can be scoped to one. `observeTextEditors`
// fires once per editor already open, and it used to re-sweep the whole
// workspace from there — one pass over every editor, for every editor. Splitting
// that into a single-editor update is only correct if an editor opened after a
// kernel started still gets marked, which is what this pins.

const PACKAGE_PATH = path.join(__dirname, "..");

describe("the jupyter-kernel editor class", () => {
  let store;
  let directory;
  let previousEditor;
  let editors;

  beforeEach(async () => {
    editors = [];
    store = require("../lib/store");
    previousEditor = store.editor;
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-repl-class-")));

    const activation = lumine.packages.activatePackage(PACKAGE_PATH);
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "jupyter-repl:debug-toggle");
    await activation;
  }, 30000);

  afterEach(async () => {
    for (const editor of editors) {
      editor.destroy();
    }
    store.runningKernels = [];
    store.kernelMapping.clear();
    if (previousEditor && !previousEditor.isDestroyed()) {
      store.editor = previousEditor;
    }
    await lumine.packages.deactivatePackage("jupyter-repl");
    await lumine.fileWatchClient.settlePendingTeardown();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function openEditor(filePath) {
    const editor = await lumine.workspace.open(filePath);
    editors.push(editor);
    return editor;
  }

  // `getFilesForKernel` narrows on `instanceof Kernel` before reading the
  // grammar off it, so a plain object would take the multi-language branch.
  function startKernelFor(filePath) {
    const kernel = Object.create(Kernel.prototype);
    kernel.transport = { grammar: { name: "Python" } };
    store.runningKernels.push(kernel);
    store.kernelMapping.set(filePath, kernel);
    return kernel;
  }

  function write(name) {
    const filePath = path.join(directory, name);
    fs.writeFileSync(filePath, "print(1)\n");
    return filePath;
  }

  it("marks an editor whose file has a running kernel, and leaves the others alone", async () => {
    const withKernel = await openEditor(write("with.py"));
    const withoutKernel = await openEditor(write("without.py"));

    startKernelFor(withKernel.getPath());
    store._emitKernelsChanged();

    expect(withKernel.element.classList.contains("jupyter-kernel")).toBe(true);
    expect(withoutKernel.element.classList.contains("jupyter-kernel")).toBe(false);
  });

  it("marks an editor opened after its kernel was already running", async () => {
    const filePath = write("later.py");
    startKernelFor(filePath);
    store._emitKernelsChanged();

    const editor = await openEditor(filePath);

    expect(editor.element.classList.contains("jupyter-kernel")).toBe(true);
  });

  it("unmarks every editor once the kernel is gone", async () => {
    const editor = await openEditor(write("gone.py"));
    startKernelFor(editor.getPath());
    store._emitKernelsChanged();
    expect(editor.element.classList.contains("jupyter-kernel")).toBe(true);

    store.runningKernels = [];
    store.kernelMapping.clear();
    store._emitKernelsChanged();

    expect(editor.element.classList.contains("jupyter-kernel")).toBe(false);
  });
});
