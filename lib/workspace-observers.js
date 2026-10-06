const { CompositeDisposable, Disposable } = require("lumine");
const { isMultilanguageGrammar, observeDebugSetting } = require("./utils");
const debounce = require("lodash/debounce");

function observeRuntime({ store, disposeMcp, getKernelManager }) {
  // The widget stylesheets are injected on the first widget render; this is
  // what takes them away again on deactivation.
  store.subscriptions.add(
    new Disposable(() => require("./components/result-view/widget-styles").disposeWidgetStyles()),
  );
  // The net under a teardown that never reached `deactivate` — a crashed
  // renderer being reloaded. A live zmq socket left for Node's environment
  // teardown makes zeromq fire callbacks into the dying environment, and libzmq
  // then aborts the whole renderer ("The editor has crashed"), so every kernel
  // connection is closed while JS can still run. An orderly unload deactivates
  // first, which destroys the kernels and leaves this loop nothing to do.
  store.subscriptions.add(
    lumine.window.onWillDestroy(() => {
      disposeMcp();
      // The UI goes first, and the order is load-bearing. Destroying a kernel
      // changes the current one, which the status bar answers with an
      // `etch.update` — and that only renders on the next animation frame, by
      // which time core's `destroy()` has run on past this emit and nulled
      // `lumine.workspace`. The queued render then reads `store.kernel`, which
      // asks `lumine.workspace.isTextEditor(...)`, and throws. Destroying the
      // component afterwards cannot undo it either: `etch.destroy` goes through
      // the same scheduler and never cancels an update already queued. Dropping
      // the subscriptions first means the update is never scheduled at all.
      store._activeItemKernelSubscription?.dispose();
      store._activeItemKernelSubscription = null;
      store.subscriptions.dispose();
      // `CompositeDisposable#add` is a silent no-op once disposed, and the
      // store outlives the window, so hand it a fresh one — see `Store#dispose`.
      store.subscriptions = new CompositeDisposable();

      // A transport still starting has no Kernel facade in runningKernels.
      // Its observers need the same immediate renderer-unload close path.
      getKernelManager()?.dispose(true);

      for (const kernel of store.runningKernels.slice()) {
        try {
          // Unload teardown: observers close immediately — nothing will run
          // later to self-close them, and one left armed aborts the renderer.
          kernel.destroy(true);
        } catch (error) {
          console.error("[jupyter-repl] Error destroying kernel on unload:", error);
        }
      }
    }),
  );
  let skipLanguageMappingsChange = false;
  store.subscriptions.add(
    lumine.config.onDidChange("jupyter-repl.languageMappings", ({ oldValue }) => {
      if (skipLanguageMappingsChange) {
        skipLanguageMappingsChange = false;
        return;
      }

      if (store.runningKernels.length !== 0) {
        skipLanguageMappingsChange = true;
        lumine.config.set("jupyter-repl.languageMappings", oldValue);
        lumine.notifications.addError("jupyter-repl", {
          description: "`languageMappings` cannot be updated while kernels are running",
          dismissable: false,
        });
      }
    }),
  );
}

function observeEditors({ store, isCurrent, onKernelChanged, ensureResultContextMenu }) {
  let kernelClassUpdateScheduled = false;
  let pendingKernelClassEditors = new Set();
  let kernelClassUpdateAll = false;
  /**
   * Adds/removes the `jupyter-kernel` class on every open text editor whose file
   * currently has a running kernel, so users can scope keymaps and styles to
   * Reads the store directly, so it is called whenever the kernel set changes.
   */
  function filesWithLiveKernels() {
    const liveFiles = new Set();
    for (const kernel of store.runningKernels) {
      for (const file of store.getFilesForKernel(kernel)) {
        liveFiles.add(file);
      }
    }
    return liveFiles;
  }

  function applyKernelClass(editor, liveFiles) {
    const element = editor.element;
    if (!element) {
      return;
    }
    const filePath = editor.getPath() || `Unsaved Editor ${editor.id}`;
    element.classList.toggle("jupyter-kernel", liveFiles.has(filePath));
  }

  /**
   * The same, for one editor. `observeTextEditors` fires once per editor already
   * open, so sweeping the whole workspace from there made opening a project cost
   * one pass over every editor for every editor.
   */
  function updateEditorKernelClass(editor) {
    applyKernelClass(editor, filesWithLiveKernels());
  }

  function updateEditorKernelClasses() {
    const liveFiles = filesWithLiveKernels();
    for (const editor of lumine.workspace.getTextEditors()) {
      applyKernelClass(editor, liveFiles);
    }
  }

  function scheduleKernelClassUpdate(editor = null) {
    if (editor) pendingKernelClassEditors.add(editor);
    else kernelClassUpdateAll = true;
    if (kernelClassUpdateScheduled) return;
    kernelClassUpdateScheduled = true;
    queueMicrotask(() => {
      if (!isCurrent()) return;
      kernelClassUpdateScheduled = false;
      const updateAll = kernelClassUpdateAll;
      kernelClassUpdateAll = false;
      const editors = pendingKernelClassEditors;
      pendingKernelClassEditors = new Set();
      if (updateAll) {
        updateEditorKernelClasses();
      } else {
        const liveFiles = filesWithLiveKernels();
        for (const editor of editors) {
          if (!editor.isDestroyed?.()) applyKernelClass(editor, liveFiles);
        }
      }
    });
  }

  store.subscriptions.add(
    // Track only the center container, so activating a dock (e.g. tree-view)
    // does not clear the external kernel context of a notebook pane item.
    lumine.workspace.getCenter().onDidChangeActivePaneItem((item) => {
      store.updateActivePaneItem(item);
    }),
    lumine.workspace.observeActiveTextEditor((editor) => {
      // Keep the last source editor as the active context when focus moves to a
      // non-editor center item (e.g. the jupyter-explorer pane). Otherwise the
      // active editor (and therefore store.kernel) would become null and panels
      // like jupyter-variables / jupyter-explorer would lose the running kernel.
      if (editor) {
        store.updateEditor(editor);
      }
    }),
  );
  store.subscriptions.add(
    lumine.workspace.observeTextEditors((editor) => {
      const editorSubscriptions = new CompositeDisposable();
      editorSubscriptions.add(
        editor.onDidChangeGrammar(() => {
          if (store.editor === editor) store.setGrammar(editor);
        }),
      );

      if (isMultilanguageGrammar(editor.getGrammar())) {
        const updateGrammar = debounce(() => {
          if (store.editor === editor && !editor.isDestroyed?.()) store.setGrammar(editor);
        }, 75);
        editorSubscriptions.add(
          editor.onDidChangeCursorPosition(updateGrammar),
          new Disposable(() => updateGrammar.cancel()),
        );
      }

      editorSubscriptions.add(
        editor.onDidDestroy(() => {
          editorSubscriptions.dispose();
          store.subscriptions.remove(editorSubscriptions);
          // We keep the last editor sticky (see observeActiveTextEditor), so when
          // that editor is destroyed fall back to the current active editor to
          // avoid holding a stale reference.
          if (store.editor === editor) {
            store.updateEditor(lumine.workspace.getActiveTextEditor() || null);
          }
        }),
      );
      editorSubscriptions.add(
        editor.onDidChangeTitle(() => {
          if (store.editor === editor) store.forceEditorUpdate();
        }),
      );
      // Apply the `jupyter-kernel` class to this editor in case its file already
      // has a running kernel (e.g. reopened in a new pane), and keep it current
      // when the editor's path changes on save.
      scheduleKernelClassUpdate(editor);
      editorSubscriptions.add(editor.onDidChangePath(() => updateEditorKernelClass(editor)));

      store.subscriptions.add(editorSubscriptions);
    }),
  );
  store.subscriptions.add(
    store.onDidChangeCurrentKernel(onKernelChanged),
    // Keep the `jupyter-kernel` editor class in sync as kernels start and stop.
    // Saving an unsaved file remaps its kernelMapping key, which the same event
    // covers; newly opened editors are handled in observeTextEditors.
    store.onDidChangeKernels(() => updateEditorKernelClasses()),
  );
  // Marking every already-open editor is intentionally outside the activation
  // critical path. The observer above queues individual editors; this sweep
  // covers an editor list that changed while activation was registering it.
  scheduleKernelClassUpdate();

  // Result bubbles are not part of the bootstrap surface. Register their
  // context menu after the activation batch, when the result-view modules are
  // actually allowed to enter the module cache without charging this package.
  queueMicrotask(() => {
    if (!isCurrent() || store.subscriptions.disposed) return;
    store.subscriptions.add(observeDebugSetting());
    const disposable = ensureResultContextMenu();
    store.subscriptions.add(disposable);
  });
  return new Disposable(() => {
    pendingKernelClassEditors.clear();
    for (const editor of lumine.workspace.getTextEditors())
      editor.element?.classList.remove("jupyter-kernel");
  });
}

module.exports = { observeRuntime, observeEditors };
