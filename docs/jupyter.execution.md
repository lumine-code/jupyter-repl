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

Service consumption is passive and has no activation mode. The provider is available when jupyter-repl is enabled and bootstrapped; a consumer can await `lumine.packages.requestService("jupyter.execution", "^1.0.0")` to check whether a compatible provider is currently published before running its first operation.

## Contract

```ts
type CodeBlock = { code: string; row: number; cellType: "code" | "markdown" | "raw" };

type JupyterExecution = {
  runAdapter(scope: "active" | "all" | "above", moveDown?: boolean): boolean;
  runBlocks(
    editor: TextEditor,
    codeBlocks: CodeBlock[],
    options?: { autocompleteCancelled?: boolean },
  ): Promise<boolean>;
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

A `CodeBlock`'s `row` is the buffer row the result bubble anchors to — the last meaningful row of what ran, not the first. Markdown renders locally without a kernel; raw is skipped before kernel selection or result allocation. Obtain prepared blocks from `jupyter.cells.getExecutionBlocks()` so literal `.ipy` source retains headings and indentation and selected magic bodies retain their original headers.

`runBlocks` cancels the editor's completion session at entry. A caller that already cancelled it before asynchronous source preparation can pass `{ autocompleteCancelled: true }` to preserve a newer completion session opened while that preparation was pending.

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
    this.execution.runBlocks(editor, [{ code: editor.getText(), row: lastRow, cellType: "code" }]);
  },
};
```

## Behavior

**Call `runAdapter` first, with the scope you mean.** A notebook pane owned by a `jupyter.adapter` provider handles its own runs; when it claims the active item the adapter answer is the run, and dispatching blocks as well would run things twice. This mirrors what the built-in run commands have always done, and it is what keeps one keystroke meaningful in a notebook pane and a text editor alike.

`runBlocks` resolves `true` once the run is accepted and `false` when there is no editor, no blocks, or no grammar for executable code. Markdown-only runs require no kernel grammar; raw-only runs are accepted without effects. In a mixed run, leading Markdown renders before the first code block requests a kernel, and the remaining blocks retain their order and stop after a code failure. Kernel selection may prompt the user; acceptance does not wait for that picker.

One block renders through the single-result path; several go through the batch path. Repeated requests while that kernel's batch is in flight are accepted without queueing duplicate executions.

`moveDown` is deliberately a separate member rather than an option: the built-in commands capture their blocks first and move the cursor before the kernel answers, and a consumer that wants the same feel calls it in the same order.

## Teardown

`consumeJupyterExecution` receives the pipeline for as long as both packages are active. Hold it in a field and drop it in the `Disposable` you return; nothing else is held on your behalf.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. This unreleased contract uses `code`, `markdown` and `raw` throughout the ecosystem; providers and consumers are updated together before the first release.
