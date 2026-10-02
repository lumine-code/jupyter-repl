# anywidget

Custom anywidget frontends render inside an isolated browser frame. Install `anywidget` in the active Python environment, then display an `AnyWidget` as usual:

```python
import anywidget
import traitlets

class Counter(anywidget.AnyWidget):
    _esm = """
    export default {
      render({ model, el, signal }) {
        const button = document.createElement("button");
        const update = () => button.textContent = `Count: ${model.get("count")}`;
        button.addEventListener("click", () => {
          model.set("count", model.get("count") + 1);
          model.save_changes();
        }, { signal });
        model.on("change:count", update);
        signal.addEventListener("abort", () => model.off("change:count", update));
        update();
        el.appendChild(button);
      }
    };
    """
    count = traitlets.Int(0).tag(sync=True)

counter = Counter()
counter
```

Changing `counter.count` from Python updates the frontend; clicking the button updates the Python trait through the existing widget comm.

## Frontend interface

Inline `_esm` source and HTTPS ESM URLs are supported, including absolute HTTPS imports from inline modules. `_css` accepts inline CSS or an HTTPS stylesheet URL. Remote resources need CORS permission for the frame's opaque origin. Relative imports, local filesystem URLs and plain HTTP resources are not supported. The frontend runs as browser JavaScript, with no Node modules, editor API or access to the enclosing document.

The [Anywidget Front-End Module interface](https://anywidget.dev/en/afm/) supports default objects, async factories, async `initialize` and `render` hooks, returned cleanup functions and `AbortSignal`. The model exposes `get`, `set`, `on`, `off`, `save_changes` and `send`; trait updates, custom messages and binary buffers work in both directions. Existing user traits may be changed, including traits beginning with an underscore. Frontend module metadata, `_esm`, `_css` and prototype properties cannot be written through the bridge.

`host.getModel(ref)` and `host.getWidget(ref)` resolve referenced anywidget children. References must occur in the root widget's or an already resolved child's state; unrelated models in the kernel remain inaccessible. `getWidget` exposes the child's initialization exports and a `render({ el, signal })` function. Other kinds of ipywidgets can be displayed alongside an anywidget, but cannot be composed through this host API.

Initialization runs once per model in each isolated output context, before any of that context's root or child views render. Displaying the same model in separate outputs creates separate frontend contexts, with shared Python trait state and independent initialization closures. This is a deliberate isolation boundary and differs from the AFM requirement for initialization state shared across all frontend views; full AFM 0.11 conformance is not claimed.

## Lifecycle

Removing a view aborts its frontend signals, runs returned cleanup functions, drops model subscriptions and closes the frame's private message channel. The model's shared comm survives while other views use it. Changing `_esm` or `_css` disposes the previous context before loading a replacement with the current trait state. A kernel restart or package teardown closes the models and removes their views.

Saved widget state can render without a kernel, but writes and custom messages report that no live connection exists. Frontends that rely on a kernel exchange during initialization may therefore need the notebook's cell to be run again.

## Isolation

The frame uses `sandbox="allow-scripts"` without `allow-same-origin`. Its startup message is checked against the exact frame window and a random nonce; subsequent traffic uses a dedicated `MessageChannel`. Its content security policy blocks local files, workers, nested frames, plugins and forms. HTTPS network requests and scripts are available to the frontend. The frame has its own script policy, including the dynamic code execution required by Bokeh callbacks; the editor's content security policy is unchanged.

The iframe loads a local standalone document because `srcdoc` would inherit the editor's stricter script policy. Its trusted bootstrap is embedded in [isolated-frame.html](../lib/components/result-view/isolated-frame.html): an opaque-origin local document cannot fetch a second local script. Regenerate it after editing `isolated-frame-runtime.js` with `node script/build-isolated-frame.js`.

View cleanup briefly retains the hidden iframe using Chromium's atomic `moveBefore` operation so queued cleanup messages can run without losing the browsing context. An acknowledgement removes the frame; a one-second deadline removes a frontend whose cleanup never settles. Tests execute the frame inside Lumine and verify that Node globals and parent DOM access are unavailable, worker creation is blocked, binary data survives the bridge and asynchronous cleanup completes.
