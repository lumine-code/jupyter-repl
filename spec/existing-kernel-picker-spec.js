const ExistingKernelPicker = require("../lib/existing-kernel-picker");
const adapterIntegration = require("../lib/adapter-integration");
const store = require("../lib/store");

describe("existing kernel picker", () => {
  let picker;

  beforeEach(() => {
    store.runningKernels = [
      {
        id: "python",
        displayName: "Python 3",
        kernelSpec: { name: "python3", language: "python" },
      },
      {
        id: "r",
        displayName: "R",
        kernelSpec: { name: "ir", language: "R" },
      },
    ];
    spyOn(store, "getFilesForKernel").and.returnValue([]);
    picker = new ExistingKernelPicker();
  });

  afterEach(() => {
    picker.destroy();
    store.runningKernels = [];
  });

  async function flushPromises() {
    for (let index = 0; index < 10; index++) await Promise.resolve();
  }

  it("offers every running kernel to a notebook adapter", async () => {
    picker.toggle({ adapter: {}, grammar: { name: "Python", scopeName: "source.python" } });
    await flushPromises();

    expect(picker.selectList.getItems()).toEqual(store.runningKernels);
  });

  it("binds to the adapter context captured when the picker opened", () => {
    const context = { adapter: { name: "captured adapter" } };
    spyOn(adapterIntegration, "bindAdapterKernel").and.resolveTo(true);

    picker.toggle(context);
    picker.selectKernel(store.runningKernels[1]);

    expect(adapterIntegration.bindAdapterKernel).toHaveBeenCalledWith(
      context,
      store.runningKernels[1],
    );
  });

  it("does not bind an ordinary file whose captured editor was destroyed", () => {
    const editor = { isDestroyed: () => true, getPath: () => "C:\\work\\gone.py" };
    spyOn(store, "newKernel");

    picker.toggle({
      filePath: editor.getPath(),
      editor,
      grammar: { name: "Python", scopeName: "source.python" },
    });
    picker.selectKernel(store.runningKernels[0]);

    expect(store.newKernel).not.toHaveBeenCalled();
  });
});
