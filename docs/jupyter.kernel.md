# jupyter.kernel

Reads the running Jupyter kernels: which one is active, which exist, when that changes, and what each can be asked.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterKernel()` returning the kernel provider        |
| Consumed by | `consumeJupyterKernel(kernel)`                                |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

This is the extension point for anything that follows the REPL's kernels — a status indicator, a variable inspector, a package that runs its own code against the same session.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "jupyter.kernel": {
      "versions": { "^1.0.0": "consumeJupyterKernel" }
    }
  }
}
```

## Contract

```ts
type JupyterProvider = {
  getActiveKernel(): JupyterKernel | null;
  getRunningKernels(): JupyterKernel[];
  getFilesForKernel(kernel: JupyterKernel): string[];
  getCellRange(): Range | null;
  getFocusedEditor(): TextEditor | null;
  getExpressionAtCursor(editor?: TextEditor): string;
  onDidChangeKernel(callback: (kernel: JupyterKernel | null) => void): Disposable;
  observeActiveKernel(callback: (kernel: JupyterKernel | null) => void): Disposable;
  onDidAddKernel(callback: (kernel: JupyterKernel) => void): Disposable;
  onDidRemoveKernel(callback: (kernel: JupyterKernel) => void): Disposable;
  onDidChangeKernels(callback: () => void): Disposable;
  shutdownAllKernels(): Disposable;
};
```

Required members:

| Member                          | Description                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `getActiveKernel()`             | The kernel for the active editor, or `null` when none is running.            |
| `getRunningKernels()`           | Every kernel in this window, in the order they started.                      |
| `onDidChangeKernel(callback)`   | Fires when the active kernel changes, including to `null`.                   |
| `observeActiveKernel(callback)` | Calls back with the current active kernel immediately, then on every change. |
| `onDidChangeKernels(callback)`  | Fires when the set of kernels changes, or the files any of them is bound to. |

Optional members:

| Member                        | Description                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `getFilesForKernel(kernel)`   | The files a kernel serves. An unsaved editor appears as `Unsaved Editor <id>`.  |
| `getCellRange()`              | The buffer range of the cell containing the cursor, or `null` outside any cell. |
| `getFocusedEditor()`          | The editor a code-reading command should act on, including a notebook's cell.   |
| `getExpressionAtCursor()`     | The expression under the cursor, as this package parses one. `""` when none.    |
| `onDidAddKernel(callback)`    | Fires when a kernel starts.                                                     |
| `onDidRemoveKernel(callback)` | Fires when a kernel goes away.                                                  |
| `shutdownAllKernels()`        | Shuts down every kernel. For a consumer that owns the window, not for a panel.  |

Each kernel is a `JupyterKernel`:

```ts
type JupyterKernel = {
  // identity
  readonly id: string;
  readonly displayName: string;
  readonly language: string;
  readonly grammar: Grammar;
  readonly kernelSpec: object;
  getConnectionFile(): string;

  // running code
  execute(
    code: string,
    options?: { timeoutMs?: number },
  ): Promise<{
    status: "ok" | "error" | "timeout";
    outputs: object[];
    executionCount: number | null;
    error?: { ename: string; evalue: string; traceback: string[] };
  }>;
  executeWithCallback(code: string, onResults: (result: object) => void): void;
  executeWatch(code: string, onResults: (result: object) => void): void;
  complete(code: string, options?: { timeoutMs?: number }): Promise<object>;
  inspect(
    code: string,
    cursorPos: number,
    options?: { timeoutMs?: number },
  ): Promise<{
    data: object;
    found: boolean;
    status?: "error" | "timeout";
    ename?: string;
    evalue?: string;
  }>;

  // state — kernel-wide: every field follows the kernel process across all of
  // its clients, so a cell run from a `jupyter console` attached to the same
  // kernel moves them exactly like one run from this editor
  readonly executionState: string;
  readonly executionCount: number;
  readonly lastExecutionTime: string;
  readonly executionStartTime: number | null;
  onDidChangeExecutionState(callback: (state: string) => void): Disposable;
  onDidChangeStatus(callback: () => void): Disposable;
  onDidBecomeIdle(callback: () => void): Disposable;
  onDidDestroy(callback: () => void): void;

  // control
  interrupt(): void;
  restart(onRestarted?: () => void): void;
  shutdown(): Promise<void>; // shuts down AND releases: the kernel leaves the running list
  addMiddleware(middleware: object): void;
};
```

`id` is stable for the life of the kernel and unique within the window. Name a kernel by it rather than by `displayName`, which two Python 3 kernels share, or by `getConnectionFile()`, which throws for a kernel reached over a websocket.

`execute`'s `outputs` are **notebook-format outputs** — `stream`, `execute_result`, `display_data`, `error` — in the order they arrived, ready for `jupyter.output`'s `getOutputPlainText` or its renderers. A failed execution also reports `error` separately, lifted from the `error` output.

Plugin executions have no pane-item owner in this service contract, so `execute` and `executeWithCallback` synchronously capture the workspace's active native-window surface before sending anything to the kernel. A later stdin prompt stays in that captured window even if focus changes; the call throws before execution when no registered live surface is active.

**`execute` settles only when the kernel replies.** Code that never finishes — a `while True:`, a blocked socket — leaves the promise pending for the life of the window unless you pass `timeoutMs`, which resolves with `status: "timeout"` and whatever outputs arrived. The kernel goes on running either way: stopping it is `interrupt()`, and that is a decision for the caller, since a long execution may be doing exactly what the user asked for.

**`complete` and `inspect` time out by default**, unlike `execute`, and the asymmetry is deliberate: a long execution may be doing exactly what the user asked, but a kernel answers an introspection request in milliseconds or not at all. They give up after 10 seconds and resolve with `status: "timeout"` — an empty `matches` for `complete`, `found: false` for `inspect` — so a caller that never checks `status` reads a timeout as "nothing found" rather than throwing. Pass `timeoutMs: 0` to wait indefinitely. `inspect` also carries `status: "error"` with `ename`/`evalue` when the kernel went away mid-request, which is the only thing distinguishing that from a kernel that looked and knew nothing.

**A middleware that implements `shutdown` must return the promise of the shutdown it performs** — the editor destroys the kernel, SIGKILL included, the moment that promise settles, so a middleware returning `undefined` turns every graceful shutdown back into a kill.

**`shutdown` both asks and releases**, and its promise settles once the kernel is actually gone. Await it if you are about to start another kernel in its place; a local kernel is given a couple of seconds to run its own teardown — `atexit` handlers, flushed buffers, released handles — and killed if it overruns.

`executeWatch` is the one to reach for when a panel asks the kernel a question rather than running the user's code: it takes no execution number and does not move the status bar's counter or timer.

`onDidBecomeIdle` fires when the kernel finishes a cell — any client's, not only this editor's. Bursts are debounced into one call, and the idles produced by `executeWatch` refetches themselves are skipped, so refetching on this signal cannot feed back into itself.

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("lumine");

module.exports = {
  consumeJupyterKernel(provider) {
    const disposables = new CompositeDisposable();
    this.follow(provider.getActiveKernel());
    disposables.add(
      provider.onDidChangeKernel((kernel) => this.follow(kernel)),
      new Disposable(() => this.follow(null)),
    );
    return disposables;
  },

  follow(kernel) {
    this.kernelSubscription?.dispose();
    this.kernelSubscription = kernel?.onDidBecomeIdle(() => this.refresh(kernel));
    this.refresh(kernel);
  },
};
```

## Behavior

The provider is **created lazily on first request** — the kernel plugin API is not loaded until something asks for it — so consuming the service has a small one-off cost and no effect on startup.

`getActiveKernel()` is scoped to the active editor, not to the window. Switching tabs can change the answer without any kernel starting or stopping, and it answers `null` rather than throwing when nothing is running.

None of the `onDid…` methods replay on subscribe. Read the current value first, as the example does.

A kernel is handed out as a wrapper, and the wrapper for a given kernel is stable, so it can be compared by identity. Every method on it throws once its kernel has been destroyed; subscribe to `onDidDestroy` if you hold one across time.

`getCellRange()` reads from the cell model the jupyter-cells package provides, so it answers `null` when that package is not installed even though the file has `# %%` markers.

`getFocusedEditor()` prefers the focused editor over the active pane item, so it finds the cell editors a notebook renders — the workspace does not report those. `getExpressionAtCursor()` defaults to it, which is why a panel gets the same answer the REPL itself would give instead of parsing the buffer again.

## Pane items with a kernel of their own

A panel that shows the output of one particular kernel is not necessarily looking at the active editor's. Such a pane item may say so, and the provider will report it as the active kernel while the item is the active **center** item:

| Member                               | Description                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `getJupyterKernel()`                 | The kernel this item is showing, or `null`. Required to opt in.                                              |
| `onDidChangeJupyterKernel(callback)` | Fires when that answer changes. Optional, but without it a change goes unnoticed until the active item does. |

This is asked of the item rather than matched against a list of URIs, so a panel in another package participates without `jupyter-repl` knowing it exists. Return the kernel exactly as the service handed it over; an item in a dock is never the active center item, so a dock-only panel has no reason to implement this.

## Teardown

Return a `Disposable` that unsubscribes and drops your reference. The kernels belong to `jupyter-repl` — do not shut one down because your own panel is closing; the user may still be using it.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
