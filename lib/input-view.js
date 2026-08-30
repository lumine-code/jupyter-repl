"use strict";

const { CompositeDisposable, Disposable, TextEditor } = require("lumine");

/**
 * A modal used for authentication prompts and kernel input requests.
 * It deliberately keeps no history, because its value may be a password.
 */
class InputView {
  constructor({ prompt, defaultText, allowCancel, password }, onConfirmed, onCancelled) {
    this.onConfirmed = onConfirmed;
    this.onCancelled = onCancelled;
    this.allowCancel = Boolean(allowCancel);
    this.disposables = new CompositeDisposable();

    this.element = document.createElement("div");
    this.element.classList.add("jupyter-repl", "input-view");

    const label = document.createElement("div");
    label.classList.add("label", "icon", "icon-arrow-right");
    label.textContent = prompt || "Kernel requires input";

    this.miniEditor = new TextEditor({ mini: true });
    this.disposables.add(lumine.textEditors.add(this.miniEditor));

    if (password) {
      const updateMask = () => {
        const hasText = this.miniEditor.getText().length > 0;
        this.miniEditor.element.style.webkitTextSecurity = hasText ? "disc" : "none";
      };
      this.disposables.add(this.miniEditor.onDidChange(updateMask));
      updateMask();
    }

    if (defaultText != null) this.miniEditor.setText(defaultText);

    this.element.append(label, this.miniEditor.element);
    this.disposables.add(
      lumine.commands.add(this.element, {
        "core:confirm": () => this.confirm(),
        ...(this.allowCancel ? { "core:cancel": () => this.cancel() } : {}),
      }),
    );

    if (this.allowCancel) {
      const handleBlur = () => {
        if (this.element.ownerDocument.hasFocus()) this.cancel();
      };
      this.miniEditor.element.addEventListener("blur", handleBlur);
      this.disposables.add(
        new Disposable(() => this.miniEditor?.element.removeEventListener("blur", handleBlur)),
      );
    }

    this.panel = lumine.workspace.addModalPanel({
      item: this.element,
      autoFocus: this.miniEditor.element,
      visible: false,
    });
    this.disposables.add(
      this.panel.onDidChangeVisible((visible) => {
        if (!visible && !this.settled) this.cancel();
      }),
      this.panel.onDidDestroy(() => {
        if (!this.settled) this.cancel();
      }),
    );
  }

  attach() {
    if (this.settled) throw new Error("Cannot show a settled kernel input view");
    if (!this.panel.isVisible()) this.panel.show();
    this.miniEditor.element.focus();
    this.miniEditor.scrollToCursorPosition();
    return this;
  }

  confirm() {
    if (!this.settled) this.settle("confirmed", this.miniEditor.getText());
  }

  cancel() {
    this.settle("cancelled");
  }

  close() {
    this.cancel();
  }

  settle(outcome, value) {
    if (this.settled) return false;
    this.settled = true;
    const callback = outcome === "confirmed" ? this.onConfirmed : this.onCancelled;

    try {
      callback?.(value);
    } finally {
      this.destroy();
    }
    return true;
  }

  destroy() {
    if (this.destroyed) return;
    if (!this.settled) {
      this.cancel();
      return;
    }
    this.destroyed = true;
    this.disposables.dispose();
    this.panel?.destroy();
    this.panel = null;
    this.miniEditor?.destroy();
    this.miniEditor = null;
    this.element.remove();
  }
}

module.exports = InputView;
