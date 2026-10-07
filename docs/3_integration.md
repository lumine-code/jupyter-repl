# Integration

The two interfaces a package writes against: the adapter that lets a document of your own be run, and the kernel object the services hand over.

## Runtime activation

Service consumption is passive: consuming `jupyter.kernel`, `jupyter.output`, or `jupyter.execution` never activates jupyter-repl. The provider publishes lightweight service facades during its synchronous bootstrap; a consumer can await `lumine.packages.requestService("<service>", "^1.0.0")` to check availability before an operation, then await any asynchronous method on the facade for heavy work.

## Notebook adapter API

Provide [`jupyter.adapter`](jupyter.adapter.md) to describe a notebook document, its executable targets, result persistence and focus behavior to the runtime. Capture the invoking item and targets before asynchronous preparation, then submit them through [`jupyter.execution`](jupyter.execution.md). The shared document owns the kernel binding across split panes, and callbacks receive public sessions. The contract document defines the resolver, required and optional adapter members, lifecycle and teardown.

## Session requests

Use [jupyter.context](jupyter.context.md) to resolve an invocation's source editor and expression. Look up that explicit editor's public session through [jupyter.kernel](jupyter.kernel.md), then create a request handle for execution, inspection or completion. Subscribe before awaiting the handle's completion, and dispose the subscriptions and request observation in a finally block. The session contract contains the complete request schema and examples.

Purpose distinguishes ordinary user execution from queries made by watches and auxiliary panels. Query work stays out of ordinary history and suppresses query-triggered idle refresh loops. Execution count, output and duration belong to the request; session status describes the shared process and can also change because another client is executing code.

Capture the session generation when starting an operation and verify it before applying asynchronous results. Restart, shutdown, provider retirement and owner closure invalidate pending work. Panels release their own observation when they close; kernel resources remain owned by the runtime.

Use [jupyter.execution](jupyter.execution.md) when a source command or notebook action needs kernel selection and output persistence. Its receipt separates acceptance from actual completion. Use [jupyter.output](jupyter.output.md) for shared rendering and saved-output import.
