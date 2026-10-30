/**
 * A simple modal input dialog.
 * Used for authentication prompts and kernel input requests.
 * Does NOT save history (unlike ExecPanel) for security.
 */
const { CompositeDisposable, Disposable } = require("lumine");

class InputView {
  constructor({ prompt, defaultText, allowCancel, password }, onConfirmed, onCancelled) {
    this.onConfirmed = onConfirmed;
    this.onCancelled = onCancelled;
    this.allowCancel = Boolean(allowCancel);
    this.disposables = new CompositeDisposable();

    this.element = document.createElement("div");
    this.element.classList.add("jupyter-repl", "input-view", "dialog-form");
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", "Kernel input");

    const header = document.createElement("header");
    header.className = "dialog-header";
    const label = document.createElement("h2");
    label.classList.add("dialog-title", "icon", "icon-arrow-right");
    label.textContent = prompt || "Kernel requires input";
    header.append(label);
    this.miniEditor = lumine.workspace.buildTextEditor({
      mini: true,
    });
    this._textEditorDisposable = lumine.textEditors.add(this.miniEditor, { role: "input" });
    this.miniEditor.element.setAttribute("aria-label", label.textContent);

    if (password) {
      // Password mode: only show dots when there's actual text
      const updateMask = () => {
        const hasText = this.miniEditor.getBuffer().getLength() > 0;
        this.miniEditor.element.style.webkitTextSecurity = hasText ? "disc" : "none";
      };
      this.disposables.add(this.miniEditor.onDidChange(updateMask));
      updateMask();
    }

    if (defaultText) {
      this.miniEditor.setText(defaultText);
    }

    const field = document.createElement("div");
    field.className = "dialog-field";
    field.append(this.miniEditor.element);
    const footer = document.createElement("div");
    footer.className = "dialog-footer dialog-actions";
    if (this.allowCancel) {
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.type = "button";
      cancel.textContent = "Cancel";
      cancel.addEventListener("click", () => this.cancel());
      footer.append(cancel);
    }
    const confirm = document.createElement("button");
    confirm.className = "btn btn-primary";
    confirm.type = "button";
    confirm.textContent = "Submit";
    confirm.addEventListener("click", () => this.confirm());
    footer.append(confirm);
    this.element.append(header, field, footer);

    this.disposables.add(
      lumine.commands.add(this.element, {
        "core:confirm": (event) => {
          event.stopPropagation();
          this.confirm();
        },
        "core:cancel": (event) => {
          event.stopPropagation();
          if (this.allowCancel) this.cancel();
        },
      }),
    );

    if (allowCancel) {
      const focusout = () => {
        queueMicrotask(() => {
          const document = this.element.ownerDocument;
          if (
            !this.closed &&
            !this.rehosting &&
            document.hasFocus() &&
            !this.element.contains(document.activeElement)
          )
            this.cancel();
        });
      };
      this.element.addEventListener("focusout", focusout);
      this.disposables.add(
        new Disposable(() => this.element.removeEventListener("focusout", focusout)),
      );
    }
  }

  confirm() {
    if (!this.miniEditor) return;
    const text = this.miniEditor.getText();
    const callback = this.onConfirmed;
    this.close();
    callback?.(text);
  }

  cancel() {
    if (this.closed) return;
    const callback = this.onCancelled;
    this.close();
    if (callback) {
      callback();
    }
  }

  close() {
    if (this.closed) return;
    const document = this.element.ownerDocument;
    const restoreFocus =
      !this.window?.isDestroyed() &&
      document.hasFocus() &&
      this.element.contains(document.activeElement);
    const previousFocus = this.previousFocus;
    this.closed = true;
    this.disposables.dispose();
    this.releasePresentation();

    if (this._textEditorDisposable) {
      this._textEditorDisposable.dispose();
      this._textEditorDisposable = null;
    }

    // Destroy the TextEditor to free resources
    if (this.miniEditor) {
      this.miniEditor.destroy();
      this.miniEditor = null;
    }

    this.element.remove();

    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
  }

  releasePresentation() {
    this.presentationSubscription?.dispose();
    this.presentationSubscription = null;
    const panel = this.panel;
    this.panel = null;
    this.window = null;
    this.previousFocus = null;
    panel?.destroy();
  }

  attach({ window } = {}) {
    if (this.closed || this.panel) return;
    const workspace = lumine.workspace;
    window ??= workspace.getFocusedWindow() ?? workspace.getMainWindow();
    if (
      !workspace.isAlive() ||
      workspace.windowLifecycleChanging ||
      !window ||
      window.isDestroyed()
    ) {
      this.close();
      return;
    }
    this.window = window;
    // Remember focus before the custom modal takes it.
    const active = window.getDocument().activeElement;
    if (active && !active.closest(".modal")) {
      this.previousFocus = active;
    }

    this.panel = workspace.addModalPanel({
      item: this.element,
      window,
      restoreFocus: false,
      visible: false,
      autoFocus: this.miniEditor.element,
      className: "dialog-panel",
    });
    this.presentationSubscription = window.onWillDestroy(() => {
      const main = workspace.getMainWindow();
      if (
        !window.isMain() &&
        workspace.isAlive() &&
        !workspace.windowLifecycleChanging &&
        main &&
        !main.isDestroyed()
      ) {
        // The kernel and input request outlive a presentation. Preserve the
        // draft rather than leaving a running kernel waiting on invisible UI.
        this.rehosting = true;
        try {
          this.releasePresentation();
          this.attach({ window: main });
        } finally {
          this.rehosting = false;
        }
      } else this.close();
    });
    this.panel.show();
    this.miniEditor.element.focus();
    this.miniEditor.scrollToCursorPosition({ mode: "nearest" });
  }
}

module.exports = InputView;
