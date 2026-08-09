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
  readonly displayName: string;
  readonly language: string;
  readonly grammar: Grammar;
  readonly kernelSpec: object;
  getConnectionFile(): string;

  // running code
  execute(code: string): Promise<{ status: "ok" | "error"; outputs: object[]; error?: object }>;
  executeWithCallback(code: string, onResults: (result: object) => void): void;
  executeWatch(code: string, onResults: (result: object) => void): void;
  complete(code: string): Promise<object>;
  inspect(code: string, cursorPos: number): Promise<{ data: object; found: boolean }>;

  // state
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
  shutdown(): void; // shuts down AND releases: the kernel leaves the running list
  addMiddleware(middleware: object): void;
};
```

`executeWatch` is the one to reach for when a panel asks the kernel a question rather than running the user's code: it takes no execution number and does not move the status bar's counter or timer.

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

`getCellRange()` reads from the cell markers the REPL maintains, so it answers `null` when cell markers are switched off in the settings even though the file has cells.

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
