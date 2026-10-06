const KernelRegistry = require("../lib/store/kernel-registry");

class TestKernel {
  constructor(grammarName, startKey = grammarName) {
    this.grammar = { name: grammarName };
    this.kernelSpec = { display_name: grammarName };
    this.transport = { startingKernelKey: startKey };
  }
}

function build(hooks = {}) {
  return new KernelRegistry({
    isKernel: (value) => value instanceof TestKernel,
    didAdd() {},
    didRemove() {},
    didChange() {},
    bindFile() {},
    releaseFile() {},
    remapFile() {},
    releaseReferences() {
      return false;
    },
    remapReferences() {},
    ...hooks,
  });
}

describe("kernel registration and mapping ownership", () => {
  it("publishes ordinary registration after binding the file and before clearing its launch marker", () => {
    const seen = [];
    const kernel = new TestKernel("Python", "launch-1");
    const owner = {};
    const registry = build({
      bindFile: (bindingOwner, filePath) => seen.push(["bind", bindingOwner, filePath]),
      didAdd: (added) =>
        seen.push([
          "add",
          added,
          registry.kernelMapping.get("first.py"),
          registry.runningKernels[0],
        ]),
      didChange: () => seen.push(["change", registry.startingKernels.has("launch-1")]),
    });
    registry.startKernel("launch-1");

    registry.register(kernel, "first.py", null, false, owner);

    expect(seen).toEqual([
      ["bind", owner, "first.py"],
      ["add", kernel, kernel, kernel],
      ["change", true],
    ]);
    expect(registry.startingKernels.has("launch-1")).toBe(false);
  });

  it("keeps provisional transactions silent and refuses a superseded commit or rollback", () => {
    const seen = [];
    const previous = new TestKernel("Previous");
    const first = new TestKernel("First");
    const replacement = new TestKernel("Replacement");
    const registry = build({
      didAdd: (kernel) => seen.push(["add", kernel]),
      didChange: () => seen.push(["change", registry.startingKernels.has("Replacement")]),
    });
    registry.kernelMapping.set("document.ipynb", previous);
    registry.startKernel("Replacement");
    const oldRegistration = registry.prepareNotebookKernel(first, "document.ipynb");
    const registration = registry.prepareNotebookKernel(replacement, "document.ipynb");

    expect(seen).toEqual([]);
    expect(registry.commitNotebookKernel(oldRegistration)).toBe(false);
    expect(registry.rollbackNotebookKernel(oldRegistration)).toBe(false);
    expect(registry.kernelMapping.get("document.ipynb")).toBe(replacement);
    expect(registry.commitNotebookKernel(registration)).toBe(true);
    expect(registry.commitNotebookKernel(registration)).toBe(false);
    expect(registry.rollbackNotebookKernel(registration)).toBe(false);
    expect(seen).toEqual([
      ["add", replacement],
      ["change", false],
    ]);
  });

  it("merges grammar bindings before moving file ownership and announcing a path change", () => {
    const seen = [];
    const incoming = new TestKernel("Python");
    const existing = new TestKernel("Python");
    const javascript = new TestKernel("JavaScript");
    const registry = build({
      remapFile: (oldKey, newKey) =>
        seen.push(["file", oldKey, newKey, registry.kernelMapping.has(oldKey)]),
      didChange: () => seen.push(["change", registry.getFilesForKernel(incoming)]),
      remapReferences: () => seen.push(["references"]),
    });
    const destination = new Map([
      ["Python", existing],
      ["JavaScript", javascript],
    ]);
    registry.kernelMapping.set("unsaved", incoming);
    registry.kernelMapping.set("saved", destination);

    registry.remapKernelKey("unsaved", "saved");

    expect(destination.get("Python")).toBe(incoming);
    expect(destination.get("JavaScript")).toBe(javascript);
    expect(registry.kernelMapping.get("saved")).toBe(destination);
    expect(seen).toEqual([
      ["file", "unsaved", "saved", false],
      ["change", ["saved"]],
      ["references"],
    ]);
  });

  it("releases file ownership only when its last grammar binding is removed", () => {
    const seen = [];
    const python = new TestKernel("Python");
    const javascript = new TestKernel("JavaScript");
    const registry = build({
      releaseFile: (filePath) => seen.push(["release", filePath]),
      releaseReferences: ({ kernel }) => {
        seen.push(["references", kernel]);
        return false;
      },
      didRemove: (kernel) =>
        seen.push(["remove", kernel, registry.runningKernels.includes(kernel)]),
      didChange: () => seen.push(["change", registry.kernelMapping.has("mixed")]),
    });
    registry.runningKernels = [python, javascript];
    registry.kernelMapping.set(
      "mixed",
      new Map([
        ["Python", python],
        ["JavaScript", javascript],
      ]),
    );

    registry.deleteKernel(python);
    expect(registry.getFilesForKernel(javascript)).toEqual(["mixed"]);
    registry.deleteKernel(javascript);

    expect(seen).toEqual([
      ["references", python],
      ["remove", python, false],
      ["change", true],
      ["release", "mixed"],
      ["references", javascript],
      ["remove", javascript, false],
      ["change", false],
    ]);
  });

  it("announces an owner reference released even when no running registration remains", () => {
    const kernel = new TestKernel("Python");
    const changed = jasmine.createSpy("changed");
    const removed = jasmine.createSpy("removed");
    const registry = build({
      releaseReferences: ({ kernel: released }) => released === kernel,
      didRemove: removed,
      didChange: changed,
    });

    registry.deleteKernel(kernel);

    expect(removed).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
