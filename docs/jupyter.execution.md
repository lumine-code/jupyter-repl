# jupyter.execution

Executes captured source blocks, notebook targets, or code in an explicit session.

|             |                                                               |
| ----------- | ------------------------------------------------------------- |
| Version     | `1.0.0`                                                       |
| Provided by | `provideJupyterExecution()` returning the execution facade    |
| Consumed by | `consumeJupyterExecution(execution)` returning a `Disposable` |
| Owner       | [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) |

## Registration

```json
{
  "consumedServices": {
    "jupyter.execution": {
      "versions": { "^1.0.0": "consumeJupyterExecution" }
    }
  }
}
```

Consumption is passive. An operation can await `lumine.packages.requestService("jupyter.execution", "^1.0.0")` before reading its current service reference. Capture the invoking editor or pane item, source revision, cursor and selected targets before that wait, then verify that the captured source and owner remain valid.

## Contract

```ts
type CodeBlock = {
  code: string;
  row: number;
  cellType: "code" | "markdown" | "raw";
};

type ExecutionOutcome = {
  status: "ok" | "error" | "timeout" | "cancelled" | "unavailable" | "unknown" | "skipped";
  success?: boolean;
  requestId?: string;
  generation?: number;
  executionCount?: number | null;
  durationMs?: number | null;
  results?: {
    requestId?: string;
    generation?: number;
    status: string;
    executionCount?: number | null;
    durationMs?: number | null;
  }[];
  reason?: string;
  error?: { ename: string; evalue: string; traceback?: string[] };
};

type ExecutionReceipt = {
  id?: string;
  accepted: boolean;
  done: Promise<ExecutionOutcome>;
};

type SessionExecutionRequest = {
  session: Session;
  generation: number;
  code: string;
  owner?: object;
  signal?: AbortSignal;
};

type SurfaceExecutionRequest = {
  item?: object;
  editor?: TextEditor;
  grammar?: Grammar; // captured embedded grammar, independently of the base editor grammar
  owner?: object;
  blocks?: CodeBlock[];
  targets?: Target[];
  scope?: "active" | "all" | "above" | "selected" | "editor";
  moveDown?: boolean;
  restart?: boolean;
  clear?: boolean;
  signal?: AbortSignal;
  autocompleteCancelled?: boolean;
};

type ExecutionRequest = SessionExecutionRequest | SurfaceExecutionRequest;

type JupyterExecution = {
  execute(request: ExecutionRequest): Promise<ExecutionReceipt>;
};
```

`Session` is defined by [`jupyter.kernel`](jupyter.kernel.md), and `Target` by [`jupyter.adapter`](jupyter.adapter.md). Editorless execution supplies a live `session`, its captured `generation`, and `code`; it needs no editor and never chooses a replacement session. Source execution supplies `editor` and `blocks`, normally also `item: editor`. Notebook execution supplies its explicit `item`, shared `owner` and captured `targets`. An item with no matching adapter is refused; the runtime never falls through to a newly active editor or notebook.

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeJupyterExecution(execution) {
    const edge = {};
    this.executionEdge = edge;
    this.execution = execution;
    return new Disposable(() => {
      if (this.executionEdge === edge) this.execution = null;
    });
  },

  async runWholeFile(editor) {
    const blocks = [
      {
        code: editor.getText(),
        row: editor.getLastBufferRow(),
        cellType: "code",
      },
    ];
    const receipt = await this.execution.execute({ item: editor, editor, blocks });
    return receipt.done;
  },

  async runPrompt(session, code, signal) {
    const generation = session.generation;
    const receipt = await this.execution.execute({ session, generation, code, signal });
    return receipt.done;
  },
};
```

## Behavior

Acceptance and completion are separate. `execute()` resolves a receipt when the invocation has been accepted or refused; kernel selection and execution can still be pending. `receipt.done` settles once with the terminal outcome, including cancellation, provider retirement and unavailable context. UI commands can stop at acceptance; automation and dependent operations await completion.

Completion preserves the public request's terminal status and identity, execution count and duration. An uncertain execution remains `unknown`, an unavailable session remains `unavailable`, and cancellation remains `cancelled`; these outcomes stop the remaining batch without changing their meaning. Batch results carry bounded plain request metadata. A duplicate invocation while the same kernel's batch is in flight reports `skipped` and sends no duplicate work.

Editorless code uses the same user-request coordinator and dock output pipeline as other executions. The caller captures the session, generation, and code before awaiting service availability. The runtime refuses a retired, unregistered, or changed session before submission. Once accepted code has been sent, connection replacement preserves its typed terminal outcome, including `unknown`; it does not replay the code or substitute the newly active session. An AbortSignal cancels observation and unsent queued work without interrupting the shared kernel.

A block's `row` is the original buffer row anchoring its inline result, usually the last meaningful source row. Use `jupyter.cells.getExecutionBlocks()` to preserve typed Markdown/raw cells and selected magic headers. Raw blocks do not allocate a kernel request. Markdown source blocks render locally; leading Markdown appears before a mixed run requests a kernel, and code failures stop the remaining sequence.

`moveDown` operates on the captured editor or notebook after its source has been captured, before the kernel replies. `restart` and `clear` apply to the same explicit context and execute before the captured work. Recalculation is one request with both flags, so an asynchronous restart cannot switch to a different active notebook or recapture a moved cursor.

The runtime cancels the editor's current completion session when accepting work. A caller that cancelled completion before asynchronous source preparation can set `autocompleteCancelled: true`, preserving a newer completion session opened while preparation was pending.

Saved-output import and Markdown-to-output conversion belong to [`jupyter.output`](jupyter.output.md), separately from execution.

## Teardown

Each consumption owns one service edge. Its disposable may clear the consumer's reference only while that edge is still current; retiring an older provider must not revoke a replacement. Closing the owner, aborting `signal`, or retiring the provider settles pending receipts and prevents late work from using disposed state.

## Versioning

`1.0.0` is provided and `^1.0.0` is consumed. This preproduction contract replaces the former split execution paths throughout the ecosystem, without aliases or parallel versions.
