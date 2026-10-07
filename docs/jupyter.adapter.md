# jupyter.adapter

Describes notebook documents and execution targets to the Jupyter runtime.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterAdapter()` returning a resolver                |
| Consumed by | `consumeJupyterAdapter(resolver)` returning a `Disposable`    |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

## Registration

```json
{
  "providedServices": {
    "jupyter.adapter": {
      "versions": { "1.0.0": "provideJupyterAdapter" }
    }
  }
}
```

Consumers declare the same name under `consumedServices` with `^1.0.0`. Consumption is passive: registration publishes a lightweight resolver without starting a kernel.

## Contract

```ts
type Resolver = {
  handlesItem?(item: object): boolean;
  getAdapterForItem(item: object): Adapter | null;
  getActiveAdapter?(): Adapter | null;
};

type Owner = {
  id: string;
  getPath(): string | null;
  isDestroyed(): boolean;
  onDidChangePath(callback: (path: string | null) => void): Disposable;
  onDidDestroy(callback: () => void): Disposable;
};

type Target = {
  id: string;
  index?: number;
  source: string;
  editor: TextEditor;
  grammar: Grammar;
  type: "code" | "markdown" | "raw";
  executable: boolean;
  row?: number;
};

type Outcome = {
  kernel?: Session;
  success: boolean;
  status:
    "ok" | "error" | "failed" | "timeout" | "cancelled" | "unavailable" | "unknown" | "skipped";
  lastExecutionTime?: string;
  reason?: string;
};

type Adapter = {
  getPaneItem(): object;
  getKernelOwner(): Owner;
  getPath(): string | null;
  getTitle(): string;
  getMetadata(): object;
  getActiveTargetId(): string | null;
  getRunTargets(scope: "active" | "all" | "above" | "selected" | "editor"): Target[];
  getRunTarget(targetId: string): Target | null;
  getKernelLanguage(kernelSpec?: object): string;
  getKernelGrammar(kernelSpec?: object): Grammar;
  setKernelSpec(kernelSpec: object, languageInfo?: object): boolean;

  getAdapterId?(): string;
  getKernelTarget?(targetId?: string): Target | null;
  getKernelEditor?(targetId?: string): TextEditor | null;
  setActiveTargetId?(targetId: string): void;
  getNextRunTarget?(target: Target): Target | null;
  focusTarget?(target: Target): void;
  focusTargetEditor?(target: Target): void;
  clearTargetOutputs?(target: Target): void;
  appendTargetOutput?(target: Target, output: object): void;
  setTargetExecutionCount?(target: Target, count: number): void;
  beginTargetExecution?(target: Target, context: { kernel: Session }): Disposable;
  finishTargetExecution?(target: Target, outcome: Outcome): void;
  cancelTargetExecution?(target: Target, outcome: Outcome): void;
  failTargetExecution?(target: Target, outcome: Outcome): void;
  skipTargetExecution?(target: Target, outcome: Outcome): void;
  resolveSourceFrame?(frame: object, session: Session): { open(): Promise<unknown> } | null;
};
```

`Session` is the public object from [`jupyter.kernel`](jupyter.kernel.md). Adapter callbacks never receive a transport or an internal kernel implementation. Generation checks use `session.generation` and `onDidChangeGeneration()`; lifecycle checks use `session.executionState` and `isDestroyed()`.

## Minimal example

```js
module.exports = {
  provideJupyterAdapter() {
    return {
      getAdapterForItem(item) {
        return item?.getJupyterAdapter?.() ?? null;
      },
    };
  },
};
```

## Behavior

The resolver is the service. Its adapters describe individual pane items; consumers resolve the item named by an invocation before asynchronous preparation. A run submits that explicit item, its owner and captured target snapshots through [`jupyter.execution`](jupyter.execution.md). Changing the active pane or selected cells does not redirect a captured request.

The owner is the document shared by all splits. Its identity and kernel binding survive closing one pane and end when the last view closes. Target IDs are stable cell identities; an index is only a position snapshot. Output and completion callbacks resolve IDs again, so a reordered cell keeps its output and a deleted cell receives none. Concurrent requests to one cell have independent timing and completion, while its running indicator remains set until all accepted executions finish.

`grammar` describes syntax and language tooling for one target. Kernel selection uses the document's `getKernelLanguage()` or `getKernelGrammar()`, independently of cell syntax overrides. `setKernelSpec()` is the successful-binding commit point and atomically replaces kernelspec and the complete language-info object; cancelled or failed connections leave metadata unchanged.

Markdown and raw notebook targets are not kernel requests. The notebook owns their presentation. For source-file Markdown blocks, the execution runtime renders locally without a kernel. `appendTargetOutput()` also accepts the transient `clear_output` control message with its `wait` flag; it is never persisted as an nbformat output.

`getNextRunTarget()` controls move-down behavior. It may insert and focus an empty trailing cell, and returns `null` when the surface has no next target. `finishTargetExecution()` carries the duration of that specific target, independent of another client's work on a shared session. Session restart, shutdown, destruction or generation change clears transient document timers through session notifications, regardless of which command or API initiated the transition.

`resolveSourceFrame()` links only source captured from the current session generation. Frames carry a one-based `line`, compiler `filename`, and optionally `executionCount`. Saved execution counts have no runtime provenance. Changed or deleted cells, expired generations and unavailable sessions return `null`; a returned link rechecks its guard while revealing the cell.

## Teardown

Each consumption returns a `Disposable` that removes only its own resolver edge. Adapter ownership remains with the provider; disposing an edge does not close a document. Pending execution is invalidated when its document closes or its provider generation retires, and late output cannot recreate disposed editors or subscriptions.

When `beginTargetExecution()` is present, it returns an owned disposable for that exact job. The runtime retains the lease and disposes it on completion, cancellation or provider revocation, even when revocation occurs before begin returns. Normal finish retires the same job before the lease is disposed; both operations are idempotent. The lease removes only its own counters and timers, preserves concurrent and replacement jobs, and becomes harmless after its document closes. Registration failures roll back partial subscriptions and job state before they propagate. Each request uses a distinct target snapshot object for its begin, output, count and finish callbacks.

## Versioning

`1.0.0` is provided and `^1.0.0` is consumed. This preproduction contract moves together with every provider and consumer; it has no compatibility aliases.
