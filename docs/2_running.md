# Running code

What a run command decides to send, what you can do with the result, and how to reach the same kernel from a console.

## Code block detection

When you run code without a selection, jupyter-repl intelligently detects what to execute based on cursor position.

### Priority order

1. **Selection** - If text is selected, execute exactly that
2. **Language Specials** - Python compound statements (see below)
3. **Brackets** - Multi-line bracket expressions `()`, `[]`, `{}`
4. **Folds** - Foldable language constructs
5. **Single Line** - Current line as fallback

### Python support

| Cursor Position                  | What Gets Executed                      |
| -------------------------------- | --------------------------------------- |
| On `def`/`class` line            | Entire function/class (with decorators) |
| On `@decorator` line             | Decorated function/class                |
| On `if`/`elif`/`else` line       | Entire if-elif-else chain               |
| On `try`/`except`/`finally` line | Entire try block                        |
| On `for`/`while` line            | Loop with optional `else`               |
| On `with`/`match` line           | Entire block                            |
| **Inside body**                  | **Single line only**                    |

### Bracket expressions

| Cursor Position                      | What Gets Executed   |
| ------------------------------------ | -------------------- |
| On line ending with `[`, `(`, `{`    | Entire bracket block |
| On line starting with `]`, `)`, `}`  | Entire bracket block |
| On line opening a `'''`/`"""` string | Entire statement     |
| On line closing a `'''`/`"""` string | Entire statement     |
| **Inside bracket block or string**   | **Single line only** |

Multiline triple-quoted strings are handled together with brackets, so a call such as `doc.x('''` … `''')` executes as one statement from either its first or last line — including bare string assignments and docstrings.

### Examples

```python
# Cursor on "if" → executes entire if-elif-else
if x > 0:
    print("positive")
elif x < 0:
    print("negative")
else:
    print("zero")

# Cursor on "print" inside body → executes only that line
if x > 0:
    print("positive")  # ← cursor here = single line

# Cursor on "[" → executes entire list
data = [
    1,
    2,
    3,
]

# Cursor on "2," inside list → executes only "2,"
data = [
    1,
    2,  # ← cursor here = single line
    3,
]
```

This allows you to execute entire blocks from control lines, while still being able to inspect individual lines inside bodies.

## Output interactions

Click on output results to interact with them:

| Action                              | Effect                                       |
| ----------------------------------- | -------------------------------------------- |
| **Click**                           | Copy to clipboard (image or text)            |
| **Ctrl+Click** (Cmd+Click on macOS) | Open in editor (images open in image-editor) |

Images opened via Ctrl+Click are displayed in the image-editor package with full editing capabilities (zoom, pan, filters, save-as).

Middle-clicking anywhere on a result closes it.

A block result carries its own chrome, shown while the pointer is over it and
sitting inside the box against its right edge, clear of the scrollbars:

| Chrome                 | Effect                                                   |
| ---------------------- | -------------------------------------------------------- |
| **Close**, top right   | Remove the result                                        |
| **Expand**, top right  | Fit the box to its content, or put it back under the cap |
| **Grip**, bottom right | Drag to set the box's width and height                   |

Expand appears only while the content overflows. A dragged size applies to that
one result and is not remembered — a re-run builds a fresh result at its natural
size — and **Reset Result Size** in the result's context menu returns it sooner.
That context menu also holds every action above in words, plus copy, open in
editor and save image.

## Console launcher

Attach a standalone Jupyter console to the active kernel via its connection file. The same kernel that runs your inline code is reused, so variables and state are shared between the console and the editor.

Three commands are available:

- `jupyter-repl:open-terminal`: runs the console in an embedded [terminal](https://github.com/lumine-code/terminal) pane inside Lumine (requires the `terminal` package),
- `jupyter-repl:spawn-terminal`: opens the system terminal and runs the console there (requires the terminal-spawn package),
- `jupyter-repl:copy-console-command`: copies the resolved command to the clipboard so you can paste it anywhere (e.g. an SSH session).

Only local kernels are supported (remote kernels have no connection file).

The command template is configurable via the `Jupyter console command` setting. Two placeholders are available: `{python}` for the active kernel's Python interpreter and `{connection-file}` for the kernel's connection file path. Using `{python}` runs the console through the kernel's own interpreter, so the conda/venv environment does not need to be activated in the terminal first. Examples:

- `"{python}" -m jupyter_console --existing {connection-file}` (default),
- `"{python}" -m qtconsole --existing {connection-file}`,
- `jupyter console --existing {connection-file}` (uses `jupyter` from the terminal's PATH),
- `ssh remote 'jupyter console --existing {connection-file}'`.

## Editor kernel class

While a file has a running kernel, jupyter-repl adds the `jupyter-kernel` class to its `lumine-text-editor` element. The class is added when the kernel starts, removed when it shuts down, and follows the file when it is saved or reopened. This lets you scope styles to editors that actually have a live kernel.

For example, highlight such editors in your `styles.css`:

```css
lumine-text-editor.jupyter-kernel {
  border-left: 2px solid limegreen;
}
```
