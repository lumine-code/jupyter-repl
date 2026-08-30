# jupyter.execution

Runs pre-computed code blocks through this package's kernels and result bubbles.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterExecution()` returning the run pipeline        |
| Consumed by | `consumeJupyterExecution(execution)`                          |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

This is the seam between deciding **what** to run and running it. A consumer computes `{code, row, cellType}` blocks from whatever structure it understands — `# %%` marker cells, a notebook pane, a selection — and hands them over; kernels, result rendering, adapter routing and cursor choreography stay on this side. jupyter-cells runs marker cells through it, and jupyter-view routes its notebook toolbar through the adapter member.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "jupyter.execution": {
      "versions": { "^1.0.0": "consumeJupyterExecution" }
    }
  }
}
```

## Contract

```ts
type CodeBlock = { code: string; row: number; cellType: "codecell" | "markdown" };

type JupyterExecution = {
  runAdapter(scope: "active" | "all" | "above", moveDown?: boolean): boolean;
  runBlocks(editor: TextEditor, codeBlocks: CodeBlock[]): Promise<boolean>;
  moveDown(editor: TextEditor, endRow: number): void;
  clearResults(): void;
  restartKernel(onRestarted?: () => void): void;
  importOutputs(editor: TextEditor, bundle: { outputs: object[]; row: number }): void;
  markdownToOutput(source: string | string[]): object;
};
```

| Member                          | Description                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `runAdapter(scope, moveDown)`   | Offer the run to the notebook adapter owning the active pane. True when it took it — stop then. |
| `runBlocks(editor, codeBlocks)` | Run blocks in the editor's kernel, starting one when none is attached. See Behavior.            |
| `moveDown(editor, endRow)`      | Move the cursor past a run, honoring the scroll-behavior setting.                               |
| `clearResults()`                | Clear the current context's result bubbles, adapter panes included.                             |
| `restartKernel(onRestarted)`    | Restart the current kernel; calls back immediately when there is none.                          |
| `importOutputs(editor, bundle)` | Render outputs saved in a notebook as an inline result bubble at `row`.                         |
| `markdownToOutput(source)`      | A markdown source as the display-data shape `importOutputs` renders.                            |

A `CodeBlock`'s `row` is the buffer row the result bubble anchors to — the last meaningful row of what ran, not the first. `cellType: "markdown"` renders the block instead of executing it; strip the comment prefixes before handing it over.

## Minimal example

```js
module.exports = {
  consumeJupyterExecution(execution) {
    this.execution = execution;
    return new Disposable(() => {
      this.execution = null;
    });
  },

  runWholeFile(editor) {
    if (this.execution.runAdapter("all")) return;
    const lastRow = editor.getLastBufferRow();
    this.execution.runBlocks(editor, [
      { code: editor.getText(), row: lastRow, cellType: "codecell" },
    ]);
  },
};
```

## Behavior

**Call `runAdapter` first, with the scope you mean.** A notebook pane owned by a `jupyter.adapter` provider handles its own runs; when it claims the active item the adapter answer is the run, and dispatching blocks as well would run things twice. This mirrors what the built-in run commands have always done, and it is what keeps one keystroke meaningful in a notebook pane and a text editor alike.

`runBlocks` resolves `true` once the run is handed to the kernel pipeline and `false` when the context is too incomplete to run — no editor, no blocks, no grammar. The refusal is silent by design: the absence is on screen, and the consumer owns whatever notification its surface warrants. When no kernel is attached yet, starting one may prompt the user with the kernel picker; the promise resolves without waiting for that, so a dismissed picker is not an error.

Any later kernel stdin request is presented by the primary workspace modal.

One block renders through the single-result path; several go through the batch path, which keeps its guard against overlapping batches — a second `runBlocks` while a batch is in flight resolves `false`.

`moveDown` is deliberately a separate member rather than an option: the built-in commands capture their blocks first and move the cursor before the kernel answers, and a consumer that wants the same feel calls it in the same order.

## Teardown

`consumeJupyterExecution` receives the pipeline for as long as both packages are active. Hold it in a field and drop it in the `Disposable` you return; nothing else is held on your behalf.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
