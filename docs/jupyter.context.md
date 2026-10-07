# jupyter.context

Resolve the source editor and expression for a user invocation independently of kernel sessions.

|             |                         |
| ----------- | ----------------------- |
| Version     | `1.0.0`                 |
| Provided by | `provideJupyterContext` |
| Consumed by | `consumeJupyterContext` |
| Owner       | `jupyter-repl`          |

## Registration

```json
{
  "consumedServices": {
    "jupyter.context": {
      "versions": { "^1.0.0": "consumeJupyterContext" }
    }
  }
}
```

## Contract

```ts
interface JupyterContext {
  getFocusedEditor(event?: Event): TextEditor | null;
  getExpressionAtCursor(editor?: TextEditor): string;
  getCellRange(editor?: TextEditor): Range | null;
}
```

All methods are synchronous. `getFocusedEditor` first resolves a non-mini editor from the dispatch target, then the focused editor, the active notebook adapter's editor and the active text editor. `getExpressionAtCursor` returns an empty string when there is no source expression. `getCellRange` returns `null` without an editor or an available cell provider.

## Minimal example

```js
consumeJupyterContext(context) {
  const edge = {};
  this.contextEdge = edge;
  this.context = context;
  return new Disposable(() => {
    if (this.contextEdge !== edge) return;
    this.contextEdge = null;
    this.context = null;
  });
}

inspect(event) {
  const editor = this.context?.getFocusedEditor(event);
  const expression = this.context?.getExpressionAtCursor(editor);
  const session = this.kernels?.getKernelForEditor(editor);
  if (!session || !expression) return;
  return session.request({ type: "inspect", purpose: "query", code: expression }).done;
}
```

## Behavior

Capture the editor, expression, owner and source revision before awaiting service availability, grammar preparation or kernel selection. A later focus change cannot select a different invocation target. This service reads source UI only; `jupyter.kernel` owns session lookup, state and control, and `jupyter.execution` owns prepared execution requests.

## Teardown

Every consumption owns a distinct edge token, even when the same provider object reconnects. Dispose only the state created for that edge. Retired provider facades cannot initialize or access a new package generation.

## Versioning

This preproduction contract is provided at `1.0.0` and consumed at `^1.0.0`. Provider and consumers change together; there are no compatibility aliases.
