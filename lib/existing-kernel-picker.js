const store = require("./store");
const { log, kernelSpecProvidesGrammar, tildify } = require("./utils");

function getName(kernel) {
  const prefix = kernel.transport.gatewayName ? `${kernel.transport.gatewayName}: ` : "";
  return `${prefix + kernel.displayName} - ${store
    .getFilesForKernel(kernel)
    .map(tildify)
    .join(", ")}`;
}

class ExistingKernelPicker {
  constructor(window = lumine.workspace.getMainWindow()) {
    this.destroyed = false;
    const selectListOptions = {
      items: [],
      getItemId: (kernel) => kernel.id,
      search: { getFilterText: (kernel) => getName(kernel) },
      source: {
        mode: "snapshot",
        load: () => {
          const markers = this._context?.markers || store.markers;
          if (markers) markers.clear();
          return this.kernelItems();
        },
      },
      renderItem: (kernel, { filterKey, highlight }) => {
        return { primary: highlight(filterKey) };
      },
      commands: {
        "jupyter-repl:connect-existing-kernel": {
          description: "Connect the current file to the selected running kernel.",
          isAvailable: ({ detail }) => this.canSelectKernel(detail?.item),
          didDispatch: ({ detail }) => this.selectKernel(detail.item, detail),
        },
      },
      actions: [
        {
          command: "jupyter-repl:connect-existing-kernel",
          context: "item",
          primary: true,
          disposition: "close",
        },
      ],
      emptyMessage: "No running kernels for this language",
    };
    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      window,
      className: "jupyter-repl existing-kernel-picker",
      crumb: "Running Kernels",
    });
    this.selectList = this.selectListHost.getModel();
    this.hideSubscription = this.selectListHost.onDidHide(() => {
      this._context = null;
    });
  }

  kernelItems() {
    const grammar = this._context?.grammar || store.grammar;
    return store.runningKernels.filter(
      (kernel) =>
        !["dead", "shutting-down"].includes(kernel.transport?.lifecycle) &&
        (this._context?.adapter || kernelSpecProvidesGrammar(kernel.kernelSpec, grammar)),
    );
  }

  async selectKernel(kernel, actionContext = this.selectList.getActionContext("api")) {
    if (!this.canSelectKernel(kernel)) return false;
    log("Selected kernel:", kernel);
    const context = this._context;
    let result;
    if (context?.adapter) {
      result = await require("./adapter-integration").bindAdapterKernel(context, kernel);
    } else {
      const { filePath, editor, grammar } = context || store;
      if (!filePath || !editor || editor.isDestroyed?.() || !grammar) return false;
      result = store.newKernel(kernel, editor.getPath?.() || filePath, editor, grammar);
    }
    if (
      result !== false &&
      !this.destroyed &&
      this._context === context &&
      this.selectListHost.isVisible() &&
      this.selectList.getActionContext().sessionId === actionContext.sessionId
    )
      await this.selectList.setItems(this.kernelItems());
    return result;
  }

  canSelectKernel(kernel) {
    if (this.destroyed || !this.kernelItems().includes(kernel)) return false;
    const context = this._context;
    if (context?.adapter) return !context.owner?.isDestroyed?.();
    const { filePath, editor, grammar } = context || store;
    return Boolean(filePath && editor && !editor.isDestroyed?.() && grammar);
  }

  destroy() {
    this.destroyed = true;
    this._context = null;
    this.hideSubscription.dispose();
    this.selectListHost.destroy();
  }

  toggle(context = null) {
    if (this.selectListHost.isVisible()) {
      return this.selectListHost.cancel();
    } else {
      this._context = context;
      return this.selectListHost.show();
    }
  }
}

module.exports = ExistingKernelPicker;
