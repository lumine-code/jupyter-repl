# jupyter.kernel

Owns the running Jupyter sessions and exposes requests with explicit observation lifetimes.

|             |                                                         |
| ----------- | ------------------------------------------------------- |
| Version     | `1.0.0` provided, `^1.0.0` consumed                     |
| Provided by | `provideJupyterKernel()` returning the session provider |
| Consumed by | `consumeJupyterKernel(provider)`                        |
| Owner       | `jupyter-repl`                                          |

## Registration

```json
{
  "consumedServices": {
    "jupyter.kernel": {
      "versions": { "^1.0.0": "consumeJupyterKernel" }
    }
  }
}
```

Consumption is passive. The provider is published synchronously during the package bootstrap; consumers can check availability with `lumine.packages.requestService("jupyter.kernel", "^1.0.0")`. They retain the handle passed to their consumer method and release it when that service edge is revoked.

## Contract

```ts
type SessionProvider = {
  getActiveKernel(): Session | null;
  getKernelForEditor(editor: TextEditor): Session | null;
  getKernelForItem(item: object): Session | null;
  getRunningKernels(): Session[];
  getFilesForKernel(session: Session): string[];
  observeActiveKernel(callback: (session: Session | null) => void): Disposable;
  onDidChangeKernel(callback: (session: Session | null) => void): Disposable;
  onDidAddKernel(callback: (session: Session) => void): Disposable;
  onDidRemoveKernel(callback: (session: Session) => void): Disposable;
  onDidChangeKernels(callback: () => void): Disposable;
  shutdownAllKernels(): Disposable;
};

type RequestDescriptor = {
  type: "execute" | "inspect" | "complete";
  purpose: "user" | "query";
  code: string;
  cursorPos?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type RequestOutcome = {
  status: "ok" | "error" | "timeout" | "cancelled" | "unavailable" | "unknown";
  outputs: NotebookOutput[];
  executionCount: number | null;
  durationMs: number | null;
  error?: { ename: string; evalue: string; traceback: string[] };
  data?: object;
};

type RequestHandle = {
  readonly id: string;
  readonly generation: number;
  readonly status: "queued" | "running" | RequestOutcome["status"];
  readonly executionCount: number | null;
  readonly durationMs: number | null;
  readonly done: Promise<RequestOutcome>;
  onDidOutput(callback: (output: NotebookOutput | OutputControl) => void): Disposable;
  onDidChange(
    callback: (state: {
      status: RequestHandle["status"];
      executionCount: number | null;
      durationMs: number | null;
    }) => void,
  ): Disposable;
  dispose(): void;
};

type Session = {
  readonly id: string;
  readonly generation: number;
  readonly destroyed: boolean;
  readonly connectionState:
    "loading" | "ready" | "recovering" | "unresponsive" | "restarting" | "shutting-down" | "dead";
  readonly executionState: string;
  readonly executionCount: number;
  readonly lastExecutionTime: string;
  readonly executionStartTime: number | null;
  readonly displayName: string;
  readonly language: string;
  readonly languageInfo: object | null;
  readonly grammar: Grammar;
  readonly kernelSpec: object;
  isDestroyed(): boolean;
  request(descriptor: RequestDescriptor): RequestHandle;
  onDidChangeGeneration(callback: (generation: number) => void): Disposable;
  onDidChangeConnectionState(callback: (state: Session["connectionState"]) => void): Disposable;
  onDidChangeExecutionState(callback: (state: string) => void): Disposable;
  onDidChangeStatus(callback: () => void): Disposable;
  onDidBecomeIdle(callback: () => void): Disposable;
  onDidDestroy(callback: () => void): Disposable;
  interrupt(): void;
  restart(): Promise<boolean>;
  shutdown(): Promise<void>;
  disconnect(): void;
  getConnectionFile(): string | null;
};
```

All listed members are required. A session is a stable public handle; it exposes no transport, internal kernel, middleware chain or mutable request registry. Its opaque UUID identity remains readable after destruction. Generation identifies the connection/process lifetime that produced a request or source receipt and changes when that lifetime retires. Compare complete identities; display names and execution counts alone are not identities.

`request()` returns immediately and sends on the next microtask, allowing subscriptions to observe even a synchronous answer. Both subscription methods report future changes without replaying old events. `done` resolves once for runtime failures as well as success; invalid descriptor types, purposes or source values throw a `TypeError` before any request is sent.

An execute request settles after its shell reply and trailing IOPub idle, in either order. Its output events carry notebook-format `stream`, `execute_result`, `display_data` and `error` records, plus `clear_output` and `update_display_data` controls. Execution count and lifecycle status arrive through `onDidChange`; they are never output records. `done.outputs` is the current notebook-format bundle after stream aggregation, clears and display updates. Each observer owns its records; reducing a bundle does not mutate the incoming message or another consumer's store.

A complete request puts its kernel reply in `outcome.data`, including `matches`, `cursor_start` and `cursor_end` when supplied. An inspect request uses `outcome.data = { data: MimeBundle, found: boolean, ...replyFields }`. Timeouts and unavailable sessions carry empty fallback payloads: `{ matches: [] }` for complete and `{ data: {}, found: false }` for inspect. `cursorPos` selects the inspected position and defaults to the end of the submitted code.

`purpose: "user"` records ordinary execution history. `purpose: "query"` is for watches and inspection helpers: it does not record execution history, allows no stdin prompt and suppresses the idle refetch loop caused by the query itself. The session-wide state and execution count still describe the shared kernel process; a request's own count and duration describe only that request. Other clients attached to the kernel also change the session state.

User execution has no default timeout. Complete, inspect and query execution default to 10 seconds; `timeoutMs: 0` waits indefinitely. A timeout stops this caller's observation and accumulation, clears its subscriptions and timers, and releases callback references. It never interrupts already sent code.

## Minimal example

```js
const { CompositeDisposable, Disposable } = require("lumine");

module.exports = {
  consumeJupyterKernel(provider) {
    this.provider = provider;
    this.requests = new Set();
    return new Disposable(() => {
      for (const request of this.requests) request.dispose();
      this.requests.clear();
      this.provider = null;
    });
  },

  async run(code) {
    const session = this.provider?.getActiveKernel();
    if (!session) return;
    const request = session.request({ type: "execute", purpose: "user", code });
    this.requests.add(request);
    const subscriptions = new CompositeDisposable(
      request.onDidOutput((output) => this.appendOutput(output)),
      request.onDidChange((state) => this.updateState(state)),
    );
    try {
      const outcome = await request.done;
      if (session.generation === request.generation && !session.isDestroyed()) {
        this.finish(outcome);
      }
    } finally {
      subscriptions.dispose();
      request.dispose();
      this.requests.delete(request);
    }
  },
};
```

## Behavior

`getActiveKernel()` follows the active center document, including notebook adapters and pane items that declare `getJupyterKernel()`. Those items may also declare `onDidChangeJupyterKernel(callback)`. Explicit editor/item lookup returns that document's session independently of whichever document is active later. A fileless text editor appears as `Unsaved Editor <id>` in the provider's file list. Source parsing, cell selection and focused editor lookup belong to `jupyter.context` and `jupyter.cells`.

`observeActiveKernel()` immediately reports the current session, then changes; the `onDid...` methods never replay. `onDidChangeKernels()` reports membership and binding changes. `onDidBecomeIdle()` follows work completed by any kernel client, coalesces bursts, and skips refetches produced by queries themselves.

Connection lifecycle is separate from the execution state of the shared process. A recovering or unresponsive connection refuses new requests with `unavailable`; late messages cannot release its quarantine. Recovery never resends user code. A sent execution with an unconfirmed outcome returns `unknown` and an `ExecutionOutcomeUnknown` error; retrying it could repeat side effects. A queued execution known not to have been sent returns `cancelled` with `ExecutionCancelled`.

`shutdown()` both asks the process to stop and releases the session, and its promise settles after graceful shutdown or the bounded force-close fallback. `disconnect()` releases the client connection. Kernel resources belong to the runtime; closing a consumer panel is not a reason to shut down or disconnect a session.

## Teardown

The consumer owns every request it creates and every subscription it adds. Return a disposable that drops the provider edge, disposes those requests and removes the subscriptions. `request.dispose()` and its AbortSignal settle observation with `cancelled`. A request still waiting in the local queue is removed before sending; an already sent request continues running and its protocol ledger remains until its terminal messages retire it. Only explicit `session.interrupt()` interrupts the kernel.

Restart, transport retirement and destruction invalidate pending observations and increment the session generation. Capture the session, request generation, target identity and source snapshot before asynchronous work; use those captured values to reject stale UI updates. Session retirement returns no-op subscriptions and refuses later work with `unavailable`.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. This unreleased service is replaced together with all consumers when its contract changes; there are no legacy execution callbacks, compatibility aliases or parallel API versions.
