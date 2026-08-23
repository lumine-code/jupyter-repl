# Integration

The two interfaces a package writes against: the adapter that lets a document of your own be run, and the kernel object the services hand over.

## Notebook adapter API

The `jupyter.adapter` service allows non-TextEditor pane items, such as notebooks from the jupyter-view package, to be executed through jupyter-repl commands. The adapter owns target enumeration, source retrieval, output persistence, and focus/navigation inside the external pane item.

External packages provide this service in `package.json`:

```json
{
  "providedServices": {
    "jupyter.adapter": {
      "versions": {
        "1.0.0": "provideJupyterAdapter"
      }
    }
  }
}
```

In the provider package's main module:

```javascript
module.exports = {
  provideJupyterAdapter() {
    return {
      getActiveAdapter() {
        return this.getAdapterForItem(lumine.workspace.getActivePaneItem());
      },

      getAdapterForItem(item) {
        return item && item.getJupyterAdapter ? item.getJupyterAdapter() : null;
      },
    };
  },
};
```

The service object must expose `getActiveAdapter()` or `handlesItem(item)` plus `getAdapterForItem(item)`. The active adapter should expose:

- Required identity/context methods: `getPaneItem()`, `getPath()`, `getTitle()`. Unsaved or virtual adapters may also expose `getAdapterId()` for a stable non-path key.
- Required target methods: `getRunTargets(scope)`, `getRunTarget(id)`, `getActiveTargetId()`.
- Each target should include `{ id, editor, grammar, source, row, type, executable }`. `executable: false`, `type: "markdown"`, and `type: "raw"` targets are skipped without starting kernel execution.
- Optional kernel methods: `getKernelTarget(id)`, `getMetadata()`, `setKernelSpec(spec)`.
- Optional navigation methods: `setActiveTargetId(id)`, `getNextRunTarget(target)`, `focusTarget(target)`.
- Optional output methods: `clearTargetOutputs(target)`, `appendTargetOutput(target, output)`, `setTargetExecutionCount(target, count)`.
- Optional lifecycle methods: `beginTargetExecution(target, result)`, `finishTargetExecution(target, result)`, `cancelTargetExecution(target, result)`, `failTargetExecution(target, result)`, and `skipTargetExecution(target, result)`.
- Optional path method: `onDidChangePath(callback)`, used to keep kernel mappings stable when an unsaved adapter item is saved or renamed.

`finishTargetExecution` receives `{ kernel, success, status, lastExecutionTime }`, where `status` is one of `"ok"`, `"error"`, `"failed"`, `"cancelled"`, or `"skipped"`. Its `lastExecutionTime` is the duration of that target's own execution — not the kernel's shared field, which on a shared kernel can name another client's cell.

## Kernel API

The `jupyter.kernel` service allows other packages to interact with Jupyter kernels: execute code, get completions, inspect objects, and monitor kernel state.

In your `package.json`:

```json
{
  "consumedServices": {
    "jupyter.kernel": {
      "versions": {
        "^1.0.0": "consumeJupyter"
      }
    }
  }
}
```

In your main module:

```javascript
module.exports = {
  consumeJupyter(jupyter) {
    this.jupyter = jupyter;
  },

  async example() {
    const kernel = this.jupyter.getActiveKernel();
    const result = await kernel.execute("print('Hello')");
    console.log(result.status); // 'ok' or 'error'
  },
};
```

### JupyterProvider methods

| Method                        | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| `getActiveKernel()`           | Get the kernel for the active editor                         |
| `onDidChangeKernel(callback)` | Subscribe to kernel changes                                  |
| `getCellRange(editor)`        | Get the current cell range (needs the jupyter-cells package) |

### JupyterKernel API

#### Execution

| Method                                | Description                                               |
| ------------------------------------- | --------------------------------------------------------- |
| `execute(code)`                       | Execute code, returns `Promise<{status, outputs, error}>` |
| `executeWithCallback(code, callback)` | Execute with streaming callback                           |

#### State & Control

State is kernel-wide: every field follows the kernel process across all of its clients, so a cell run from a `jupyter console` attached to the same kernel moves them exactly like one run from the editor. The full surface — including `executionStartTime`, `onDidChangeStatus`, and `onDidBecomeIdle` — is specified in [jupyter.kernel.md](jupyter.kernel.md).

| Property/Method                       | Description                                       |
| ------------------------------------- | ------------------------------------------------- |
| `executionState`                      | Current state: `'idle'`, `'busy'`, `'starting'`   |
| `executionCount`                      | Latest execution count the kernel reported        |
| `lastExecutionTime`                   | Duration of the kernel's last finished cell       |
| `executionStartTime`                  | When the running cell started, `null` when idle   |
| `onDidChangeExecutionState(callback)` | Subscribe to state changes, returns `Disposable`  |
| `onDidChangeStatus(callback)`         | Any status field changed, returns `Disposable`    |
| `onDidBecomeIdle(callback)`           | A cell finished (debounced), returns `Disposable` |
| `interrupt()`                         | Interrupt running execution                       |
| `restart([callback])`                 | Restart the kernel                                |
| `shutdown()`                          | Shutdown the kernel, returns `Promise<void>`      |

#### Introspection

| Method                               | Description                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| `complete(code, options?)`           | Get completions, returns `Promise<{matches, ...}>`           |
| `inspect(code, cursorPos, options?)` | Get documentation, returns `Promise<{data, found, status?}>` |

#### Kernel info

| Property/Method       | Description                              |
| --------------------- | ---------------------------------------- |
| `language`            | Kernel language (e.g., `"python"`)       |
| `displayName`         | Kernel display name (e.g., `"Python 3"`) |
| `kernelSpec`          | Full kernel spec object                  |
| `getConnectionFile()` | Path to kernel connection file           |

#### Events & Middleware

| Method                      | Description                     |
| --------------------------- | ------------------------------- |
| `onDidDestroy(callback)`    | Called when kernel is destroyed |
| `addMiddleware(middleware)` | Add execution middleware        |

### Example: Execute and Handle Results

```javascript
async function runCode(jupyter) {
  const kernel = jupyter.getActiveKernel();

  // Simple execution
  const result = await kernel.execute("x = 42\nprint(x)");

  if (result.status === "ok") {
    console.log("Outputs:", result.outputs);
  } else {
    console.error(`${result.error.ename}: ${result.error.evalue}`);
  }

  // Monitor state
  const disposable = kernel.onDidChangeExecutionState((state) => {
    console.log("Kernel state:", state);
  });

  // Get completions
  const completions = await kernel.complete("import nu");
  console.log(completions.matches); // ['numpy', 'numbers', ...]

  // Cleanup
  disposable.dispose();
}
```
