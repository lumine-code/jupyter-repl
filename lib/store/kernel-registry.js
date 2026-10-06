/**
 * Own running kernels and their file/grammar bindings. Context selection and
 * resource ownership stay with the store; hooks announce committed changes and
 * let that owner release references at the same points as mapping mutations.
 */
class KernelRegistry {
  runningKernels = [];
  kernelMapping = new Map();
  startingKernels = new Map();

  constructor(hooks) {
    this.hooks = hooks;
  }

  get filePaths() {
    return [...this.kernelMapping.keys()];
  }

  startKernel(key) {
    this.startingKernels.set(key, true);
  }

  register(kernel, filePath, grammarName, multilanguage, bindingOwner) {
    if (multilanguage) {
      if (!this.kernelMapping.has(filePath)) this.kernelMapping.set(filePath, new Map());
      const mapping = this.kernelMapping.get(filePath);
      if (mapping && typeof mapping.set === "function") mapping.set(grammarName, kernel);
    } else {
      this.kernelMapping.set(filePath, kernel);
    }

    this.hooks.bindFile(bindingOwner, filePath);
    if (!this.runningKernels.includes(kernel)) {
      this.runningKernels.push(kernel);
      this.hooks.didAdd(kernel);
    }
    this.hooks.didChange();
    this._clearStartingKernel(kernel);
  }

  prepareNotebookKernel(kernel, filePath) {
    const registration = {
      kernel,
      filePath,
      hadPreviousMapping: this.kernelMapping.has(filePath),
      previousMapping: this.kernelMapping.get(filePath),
      committed: false,
    };
    this.kernelMapping.set(filePath, kernel);
    return registration;
  }

  commitNotebookKernel(registration) {
    if (!registration || registration.committed) return false;
    const { kernel, filePath } = registration;
    if (this.kernelMapping.get(filePath) !== kernel) return false;

    registration.committed = true;
    if (!this.runningKernels.includes(kernel)) {
      this.runningKernels.push(kernel);
      this.hooks.didAdd(kernel);
    }
    this._clearStartingKernel(kernel);
    this.hooks.didChange();
    return true;
  }

  rollbackNotebookKernel(registration) {
    if (!registration || registration.committed) return false;
    const { kernel, filePath, hadPreviousMapping, previousMapping } = registration;
    if (this.kernelMapping.get(filePath) !== kernel) return false;

    if (hadPreviousMapping) {
      this.kernelMapping.set(filePath, previousMapping);
    } else {
      this.kernelMapping.delete(filePath);
    }
    return true;
  }

  removeKernelKey(filePath) {
    if (!filePath) return;
    const removed = this.kernelMapping.delete(filePath);
    this.hooks.releaseFile(filePath);
    if (!removed) return;
    this.hooks.releaseReferences({ filePath });
    this.hooks.didChange();
  }

  remapKernelKey(oldKey, newKey) {
    if (!oldKey || !newKey || oldKey === newKey || !this.kernelMapping.has(oldKey)) return;

    const existing = this.kernelMapping.get(newKey);
    const incoming = this.kernelMapping.get(oldKey);
    if (this.hooks.isKernel(existing) && this.hooks.isKernel(incoming)) {
      this.kernelMapping.set(newKey, incoming);
    } else if (existing && typeof existing.set === "function" && incoming) {
      if (this.hooks.isKernel(incoming)) {
        existing.set(incoming.grammar.name, incoming);
      } else if (typeof incoming.forEach === "function") {
        incoming.forEach((kernel, grammarName) => existing.set(grammarName, kernel));
      }
    } else {
      this.kernelMapping.set(newKey, incoming);
    }
    this.kernelMapping.delete(oldKey);
    this.hooks.remapFile(oldKey, newKey);
    this.hooks.didChange();
    this.hooks.remapReferences(oldKey, newKey);
  }

  deleteKernel(kernel) {
    const grammarName = kernel.grammar.name;
    const files = this.getFilesForKernel(kernel);
    for (const file of files) {
      const mapping = this.kernelMapping.get(file);
      if (!mapping) continue;
      if (this.hooks.isKernel(mapping)) {
        this.kernelMapping.delete(file);
      } else {
        mapping.delete(grammarName);
        if (mapping.size === 0) this.kernelMapping.delete(file);
      }
      if (!this.kernelMapping.has(file)) this.hooks.releaseFile(file);
    }
    const previousCount = this.runningKernels.length;
    this.runningKernels = this.runningKernels.filter((candidate) => candidate !== kernel);
    const referencesChanged = this.hooks.releaseReferences({ kernel });

    if (this.runningKernels.length !== previousCount) this.hooks.didRemove(kernel);
    if (files.length > 0 || this.runningKernels.length !== previousCount || referencesChanged) {
      this.hooks.didChange();
    }
  }

  getFilesForKernel(kernel) {
    const grammarName = kernel.grammar.name;
    return this.filePaths.filter((file) => {
      const mapping = this.kernelMapping.get(file);
      if (!mapping) return false;
      return this.hooks.isKernel(mapping)
        ? mapping === kernel
        : mapping.get(grammarName) === kernel;
    });
  }

  /** Clear registration state after the owner has released kernel resources. */
  clear() {
    this.runningKernels = [];
    this.kernelMapping.clear();
    this.startingKernels.clear();
  }

  _clearStartingKernel(kernel) {
    this.startingKernels.delete(
      kernel.transport?.startingKernelKey || kernel.kernelSpec.display_name,
    );
  }
}

module.exports = KernelRegistry;
