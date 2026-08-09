const { CompositeDisposable } = require("lumine");
const { log } = require("./utils");
const { escapeStringRegexp, getCommentStartString } = require("./code-manager");

class KernelPicker {
  constructor(kernelSpecs) {
    this.kernelSpecs = kernelSpecs;
    this.onConfirmed = null;
    this.onUpdate = null;
    this.loaded = false;
    this.selectList = lumine.workspace.buildSelectList({
      willShow: async () => {
        await this.selectList.update({
          items: this.kernelSpecs,
        });
      },
      className: "jupyter-repl kernel-picker",
      crumb: "Kernels",
      filterKeyForItem: (item) => item.display_name,
      elementForItem: (item, { filterKey, highlight }) => {
        const element = document.createElement("li");
        element.appendChild(highlight(filterKey));
        return element;
      },
      didConfirmSelection: (item) => {
        log("Selected kernel:", item);
        this.selectList.hide();
        if (this.onConfirmed) {
          this.onConfirmed(item);
        }
      },
      didCancelSelection: () => this.selectList.hide(),
      emptyMessage: "No kernels found",
    });

    // Registered in the package's own namespace: the item-actions list (F12)
    // derives its rows — label, description, keybinding — from these
    // registrations and the keymap. Every description says something the
    // humanized command name does not.
    this.disposables = new CompositeDisposable(
      lumine.commands.add(this.selectList.element, {
        "jupyter-repl:insert-kernel-comment": {
          description: "Insert or update the kernel magic comment on the first line of the editor",
          didDispatch: () => this.insertKernelComment(),
        },
        "jupyter-repl:refresh-kernel-list": {
          description: "Rescan the kernel specs on disk and reload the list",
          didDispatch: () => this.updateKernels(),
        },
      }),
    );
  }

  async updateKernels() {
    if (!this.onUpdate) {
      return;
    }

    await this.selectList.update({
      items: [],
      loadingMessage: "Loading kernels...",
    });

    try {
      this.kernelSpecs = await this.onUpdate();
      await this.selectList.update({
        loadingMessage: null,
        items: this.kernelSpecs,
      });
    } catch (error) {
      await this.selectList.update({
        loadingMessage: null,
        items: this.kernelSpecs,
      });
      throw error;
    }
  }

  /**
   * Insert or modify the kernel magic comment (<comment>:: kernelname) at the first line.
   * Uses the editor's language-specific comment character.
   */
  insertKernelComment() {
    const item = this.selectList.getSelectedItem();
    if (!item) {
      return;
    }
    this.selectList.hide();

    const editor = lumine.workspace.getActiveTextEditor();
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
    this.disposables.dispose();
    this.selectList.destroy();
  }

  toggle() {
    this.selectList.toggle();
  }
}

module.exports = KernelPicker;
