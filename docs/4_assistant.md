# AI assistants

With `lumine-mcp` installed, an assistant connected to the editor can reach the kernels running in this window. It is there for one thing: helping you debug the session you are already in.

An assistant has its own file tools, its own search and its own shell, so nothing here repeats those. What it cannot get at any other way is your live kernel — a frame that took twenty minutes to build, the traceback from the run you actually did, a cell that is still going and will not stop.

## What it can do

| Tool                 | What it does                                                                         |
| -------------------- | ------------------------------------------------------------------------------------ |
| `JupyterListKernels` | Lists every kernel in the window: language, whether it is busy, the files it serves. |
| `JupyterExecute`     | Runs code in one, and reads back what it printed.                                    |
| `JupyterInspect`     | Asks the kernel for a docstring or signature, **without running anything**.          |
| `JupyterInterrupt`   | Stops whatever is running, keeping your variables.                                   |
| `JupyterRestart`     | Restarts the kernel, losing everything in it.                                        |

Output comes back as text. A traceback arrives with its terminal colours stripped, and a plot is reported as `image/png` rather than pasted in as several thousand tokens of base64 — the assistant is told a picture was drawn, and can ask about it in code.

Long output is truncated and says so. A run that has not finished within thirty seconds comes back as `timeout`, which does **not** stop the cell: your code carries on, and the assistant can call `JupyterInterrupt` if you want it stopped.

## What that means for your session

**`JupyterExecute` is your kernel, not a sandbox.** Code the assistant runs sees the variables you have built and changes them, exactly as if you had run a cell yourself. It can overwrite a name you were using, close a file handle, or spend an hour on a query.

For that reason `JupyterExecute` and `JupyterRestart` are **off by default**. Turn them on from _Lumine MCP: Toggle Tools_ when you want the assistant to work in the session with you, and off again when you would rather it only looked. The other three change nothing and are on.

`JupyterInspect` never runs your code, so it is safe on an expression with side effects — an assistant that only needs to know what something is should reach for it rather than `JupyterExecute`.

## Which kernel

Every tool takes an optional `kernelId`, and uses the kernel for the editor you are in when it is left out. With several notebooks open, an assistant that has not called `JupyterListKernels` first is working in whichever one you last focused — worth knowing when you ask it to check a variable and it reports that no such name exists.
