# jupyter-repl

Run code interactively with Jupyter kernels.

Supports Python, R, JavaScript, and other languages with rich output including plots, images, HTML, and LaTeX.

## Features

- **Interactive execution**: run lines, selections, or automatically detected code blocks with inline results, multiple cursors, and smart Python/bracket/fold detection.
- **Rich media output**: renders plots, images, video, HTML, LaTeX, and interactive Plotly and Vega charts inline.
- **Kernel intelligence**: autocomplete, object introspection, and a shared namespace with one kernel per language across files.
- **Kernel management**: starts local kernels, connects to remote gateways, and interrupts, restarts or shuts them down.
- **Notebook support**: imports and exports `.ipynb` notebooks and drives external notebook cells through the `jupyter.adapter` service.
- **Jupyter console**: attaches a console to the active kernel in an embedded terminal, a system terminal, or via a copied command.
- **Extensible services**: provides and consumes services for autocomplete, kernels, breakpoints, and third-party integrations.

## Installation

To install `jupyter-repl` search for _jupyter-repl_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/jupyter-repl`.

## Commands

Commands available in `lumine-workspace`:

- `jupyter-repl:run`: run code at cursor,
- `jupyter-repl:run-and-move-down`: run and move to next block,
- `jupyter-repl:run-cell`: run current cell,
- `jupyter-repl:run-cell-and-move-down`: run cell and move to next,
- `jupyter-repl:run-all`: run all code in editor,
- `jupyter-repl:run-all-above`: run all code above cursor,
- `jupyter-repl:run-all-inline`: run all code inline, one statement at a time,
- `jupyter-repl:run-all-above-inline`: run all code above cursor inline,
- `jupyter-repl:run-all-below-inline`: run all code below cursor inline,
- `jupyter-repl:recalculate-all`: clear results, restart kernel, run all,
- `jupyter-repl:recalculate-all-above`: clear results, restart kernel, run all above,
- `jupyter-repl:recalculate-all-inline`: clear results, restart kernel, run all inline,
- `jupyter-repl:recalculate-all-above-inline`: clear results, restart kernel, run all above inline,
- `jupyter-repl:clear-results`: clear output results,
- `jupyter-repl:clear-and-restart`: clear results and restart kernel,
- `jupyter-repl:clear-and-center`: clear results and center cursor,
- `jupyter-repl:toggle-output-area`: toggle output area mode,
- `jupyter-repl:start-local-kernel`: start a local kernel,
- `jupyter-repl:connect-to-remote-kernel`: connect to a remote kernel via gateway,
- `jupyter-repl:connect-to-existing-kernel`: connect to an existing kernel,
- `jupyter-repl:interrupt-kernel`: interrupt running execution,
- `jupyter-repl:restart-kernel`: restart the kernel,
- `jupyter-repl:shutdown-kernel`: shutdown the kernel,
- `jupyter-repl:rename-remote-session`: rename remote session,
- `jupyter-repl:disconnect-remote-session`: disconnect remote session,
- `jupyter-repl:update-kernels`: refresh available kernels list,
- `jupyter-repl:go-to-next-cell`: jump to next cell,
- `jupyter-repl:go-to-previous-cell`: jump to previous cell,
- `jupyter-repl:select-cell`: select current cell,
- `jupyter-repl:select-previous-cell`: extend cell selection up,
- `jupyter-repl:select-next-cell`: extend cell selection down,
- `jupyter-repl:move-cell-up`: move cell up,
- `jupyter-repl:move-cell-down`: move cell down,
- `jupyter-repl:fold-current-cell`: fold current cell,
- `jupyter-repl:fold-all-but-current-cell`: fold all cells except current,
- `jupyter-repl:export-notebook`: export editor content to `.ipynb`,
- `jupyter-repl:import-notebook`: import a `.ipynb` notebook,
- `jupyter-repl:open-examples`: open example files,
- `jupyter-repl:edit-gateways`: open `gateways.json`,
- `jupyter-repl:shutdown-all-kernels`: shutdown all running kernels,
- `jupyter-repl:debug-toggle`: toggle debug logging,
- `jupyter-repl:open-terminal`: open Jupyter console attached to active kernel in an embedded terminal pane,
- `jupyter-repl:spawn-terminal`: spawn Jupyter console attached to active kernel in a system terminal,
- `jupyter-repl:copy-console-command`: copy the Jupyter console command to clipboard,
- `jupyter-repl:copy-result`: copy a result's text or image to clipboard,
- `jupyter-repl:open-result-in-editor`: open a result's contents in a new editor,
- `jupyter-repl:save-result-image`: save a result's image to a file,
- `jupyter-repl:toggle-result-expansion`: expand or collapse a scrolling result,
- `jupyter-repl:close-result`: remove a result.

The last five act on the result the command was dispatched from — its own
context menu or its buttons — and otherwise on the result at the cursor's line.

Commands available in `.jupyter-repl.kernel-picker`, all listed with their keybindings in the item-actions list (F12):

- `jupyter-repl:insert-kernel-comment`: insert or update the kernel magic comment on the first line,
- `jupyter-repl:refresh-kernel-list`: rescan kernel specs and reload the list.

## Documentation

Rendered in the editor under Settings, and readable here:

- [Kernels](docs/1_kernels.md) — installing kernels, choosing between them, and remote gateways.
- [Running code](docs/2_running.md) — what a run sends, what the results do, and the console launcher.
- [Integration](docs/3_integration.md) — the notebook adapter and the kernel object a service hands over.
- [jupyter.kernel](docs/jupyter.kernel.md), [jupyter.output](docs/jupyter.output.md), [jupyter.breakpoints](docs/jupyter.breakpoints.md) — the service contracts.

## Services

- **[jupyter.kernel](docs/jupyter.kernel.md)** (`1.0.0`): provided to let other packages execute code, request completions and introspection, and follow kernel state.
- **[jupyter.output](docs/jupyter.output.md)** (`1.0.0`): provided to let other packages render Jupyter output bundles with this package's renderers.
- **autocomplete.provider** (`1.0.0`): provided to feed kernel-backed completions to autocomplete consumers while a kernel is active for the editor.
- **[jupyter.breakpoints](docs/jupyter.breakpoints.md)** (`1.0.0`): provided to expose breakpoint state to integrations that inspect or render breakpoints.
- **jupyter.adapter** (`^1.0.0`): consumed to run cells of external pane items, such as jupyter-view notebooks, through the normal run commands.
- **status-bar** (`^1.0.0`): consumed to display the kernel of the active editor and its execution state.
- **terminal** (`^1.0.0`): consumed to run the Jupyter console in an embedded terminal pane.
- **terminal-spawn** (`^1.0.0`): consumed to run the Jupyter console in a system terminal.
- **image-editor** (`^1.0.0`): consumed to open image outputs in a full image editor.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
