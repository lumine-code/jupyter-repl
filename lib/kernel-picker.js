const { CompositeDisposable } = require("lumine");
const { log } = require("./utils");
const { escapeStringRegexp, getCommentStartString } = require("./code-manager");

class KernelPicker {
  constructor(kernelSpecs, { allowKernelComment = true } = {}) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;
    this.onCancelled = null;
    this.onUpdate = null;
    this.loaded = false;
    const commands = {
      "jupyter-repl:select-kernel": {
        description: "Choose the selected kernel for the request that opened this picker.",
        didDispatch: ({ detail }) => this.selectKernel(detail.item),
      },
      "jupyter-repl:refresh-kernel-list": {
        description: "Rescan the kernel specs on disk and reload the list.",
        didDispatch: () => this.updateKernels(),
      },
    };
    const actions = [
      {
        command: "jupyter-repl:select-kernel",
        context: "item",
        primary: true,
        disposition: "close",
      },
      {
        command: "jupyter-repl:refresh-kernel-list",
        context: "dialog",
        disposition: "stay",
      },
    ];
    if (allowKernelComment) {
      commands["jupyter-repl:insert-kernel-comment"] = {
        description: "Insert or update the kernel magic comment on the first line of the editor.",
        didDispatch: ({ detail }) => this.insertKernelComment(detail.item),
      };
      actions.splice(1, 0, {
        command: "jupyter-repl:insert-kernel-comment",
        context: "item",
        disposition: "close",
      });
    }

    const selectListOptions = {
      items: [],
      getItemId: (item) => item.name,
      search: { getFilterText: (item) => item.display_name },
      renderItem: (item, { filterKey, highlight }) => {
        return { primary: highlight(filterKey) };
      },
      source: {
        mode: "snapshot",
        load: () => this.kernelSpecs,
      },
      commands,
      actions,
      emptyMessage: "No kernels found",
    };
    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      className: "jupyter-repl kernel-picker",
      crumb: "Kernels",
    });
    this.selectList = this.selectListHost.getModel();

    this.disposables = new CompositeDisposable(
      this.selectListHost.onDidCancel(() => {
        this._context = null;
        this.onCancelled?.();
      }),
    );
  }

  selectKernel(item) {
    if (!item) return;
    log("Selected kernel:", item);
    const onConfirmed = this.onConfirmed;
    this._context = null;
    onConfirmed?.(item);
  }

  async updateKernels() {
    if (!this.onUpdate) {
      return;
    }

    await this.selectList.setLoadingState({ message: "Loading kernels…" });

    try {
      this.kernelSpecs = await this.onUpdate();
      await this.selectList.setItems(this.kernelSpecs);
    } finally {
      await this.selectList.clearLoadingState();
    }
  }

  /**
   * Insert or modify the kernel magic comment (<comment>:: kernelname) at the first line.
   * Uses the editor's language-specific comment character.
   */
  insertKernelComment(item) {
    const editor = this._context?.editor || lumine.workspace.getActiveTextEditor();
    this._context = null;
    if (!editor) {
      return;
    }

    // Get the comment start string for the current language
    const commentStart = getCommentStartString(editor);
    if (!commentStart) {
      log("No comment string defined for current language");
      return;
    }

    const kernelLine = `${commentStart}:: ${item.name}`;
    const buffer = editor.getBuffer();
    const firstLine = buffer.lineForRow(0);

    // Match existing magic comment with any comment prefix
    const escapedComment = escapeStringRegexp(commentStart);
    const existingMagicComment =
      firstLine && firstLine.match(new RegExp(`^${escapedComment}::\\s*`));

    if (existingMagicComment) {
      // Replace existing kernel magic comment line
      buffer.setTextInRange(
        [
          [0, 0],
          [0, firstLine.length],
        ],
        kernelLine,
      );
    } else {
      // Insert new kernel magic comment with empty line after
      buffer.insert([0, 0], kernelLine + "\n\n");
    }

    log("Inserted kernel comment:", kernelLine);
  }

  destroy() {
    this._context = null;
    this.disposables.dispose();
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

module.exports = KernelPicker;
