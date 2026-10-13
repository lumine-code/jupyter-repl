# IPython and Jupyter cells

An `.ipy` file combines Python, IPython commands, and named cells in one source document. Install [`language-ipython`](https://github.com/lumine-code/language-ipython) for syntax highlighting, [`jupyter-cells`](https://github.com/lumine-code/jupyter-cells) for cell navigation and notebook conversion, and [`jupyter-repl`](https://github.com/lumine-code/jupyter-repl) to run code through a Jupyter kernel. Install these packages from **Settings → Install**. Add [`jupyter-view`](https://github.com/lumine-code/jupyter-view) to edit `.ipynb` files as notebooks.

`tree-sitter-ipython` parses the cell scaffold and IPython commands. `language-ipython` injects the original Python grammar into Python bodies, sharing one Python layer across the document, and the corresponding original grammars into Markdown and foreign magic bodies. The scaffold does not duplicate Python syntax. Cell markers belong to the scaffold and are styled as comments; raw and unknown bodies stay plain text.

The body-language rules live in `ipython-injections.scm`. An IPython command excludes its entire row from the shared Python syntax tree, splitting the surrounding source into fragments. Those fragments remain combined in one Python layer. Executable magic payloads receive separate syntax injections. Assignment magics exclude the whole assignment row rather than leaving an incomplete Python expression; the shared analysis projection separately retains the assignment name and replaces only its IPython RHS.

## Writing a cell document

Start each cell with a column-zero `# %%` marker. Text after the marker is its title. Additional `%` characters are accepted in document cell markers. Python before the first marker is an initial code cell.

The optional [`navigation-panel`](https://github.com/lumine-code/navigation-panel) keeps its own annotations: `#%%$# Section` creates a cell entry and `#%%$$# Child` adds a child entry. The number of `$` characters controls the outline level. Ordinary document markers such as `# %% Title` or `# %% [markdown] Notes` do not create navigation-panel entries. The IPython parser accepts compact navigation annotations without changing their syntax.

```ipy
# %% Setup
directory = %pwd
files = !ls

# %% [markdown] Notes
# Analysis
Write **Markdown** literally, including headings and lists.

# %% [raw] Payload
Keep this text exactly as written: <tag> { unclosed

# %% Results
values = [1, 2, 3]
sum(values)
```

`[markdown]` and `[md]` select Markdown; `[raw]` selects raw. `[code]` explicitly selects code. The bare spellings `markdown`, `md`, and `raw` are code-cell titles. Metadata is case-sensitive and must be the first complete word after the percent run. A title such as `markdownish benchmark` is a code-cell title.

Markdown and raw bodies are literal source. A Markdown heading is `# Analysis`, without an extra Python comment prefix. Raw text keeps its `#` characters and is neither executed nor rendered as Markdown. Running a Markdown cell renders it locally without starting a kernel; running raw cells skips them.

Markers inside Python strings, bracketed expressions, continued expressions, or indented suites do not split cells. In a literal Markdown, raw, or foreign-language body, a column-zero `# %%` line is reserved as the next cell boundary. Indent that line when you intend it as body text.

Use `jupyter-cells:run-cell`, `jupyter-cells:run-cell-and-move-down`, or `jupyter-cells:run-all` to execute cells. The package also provides commands to select, reorder, navigate, and fold cells.

## Cell magics

A cell magic starts with `%%` on the first nonblank line of a code cell. Its arguments stay on that header line, and its body continues to the next cell marker or the end of the file. Put a new marker before a cell magic that follows other code or a comment.

```ipy
# %% Timing
%%timeit -n 3
sum(range(1000))

# %% Shell
%%bash -x
echo hello

# %% HTML
%%html --isolated
<h1>Results</h1>
```

`time`, `timeit`, `prun`, `debug`, `capture`, and `code_wrap` keep Python syntax. Known foreign magics use the corresponding installed language grammar: shell for `bash`, `sh`, `sx`, `system`, and `!`; HTML for `html` and `HTML`; Markdown for `markdown`; LaTeX for `latex`; JavaScript for `javascript` and `js`; XML for `svg` and `SVG`; Perl and Ruby for their names. `python`, `python2`, `python3`, and `pypy` bodies use the original Python grammar. Names are case-sensitive. `script`, `writefile`, `file`, `cmd`, and unknown magics retain a plain body.

Running at the cursor inside a cell magic runs the whole magic. When you run a selected fragment of its body, the execution packages prepend the complete original header, including arguments. For example, selecting only `echo hello` in the shell example still submits it with `%%bash -x`.

Line commands such as `%pwd`, shell escapes such as `!ls`, and assignment results such as `directory = %pwd` remain IPython syntax within code cells.

Line magics highlight only their `%` prefix and command name as a magic command. `%time`, `%timeit`, `%prun`, `%debug`, and `%config` use Python highlighting for the code after their leading options. For example, `%timeit -n 3 prs.nodes_dissup(151)` keeps `%timeit` as the command, `-n 3` as arguments, and `prs.nodes_dissup(151)` as Python. Nested magic commands and shell escapes keep their IPython highlighting. `%%timeit` setup code and optional header statements in `%%prun` and `%%debug` also use Python syntax. Paths, object-name patterns, history ranges, and arguments to other or custom line magics remain text.

## Notebook syntax and execution

An `.ipynb` notebook stores each cell's type separately from its source. `jupyter-view` uses the original language package for a code cell, the Markdown package for a Markdown cell, and plain syntax for raw. A Python notebook cell containing `# %% [markdown]` remains a code cell; the comment does not change its stored type or divide it into source-file cells.

For a leading cell magic, the notebook keeps the header visible and parses the body with its original language grammar. A manual grammar choice takes precedence and is saved in the cell's language metadata. The body's selected grammar governs its highlighting, including whether it understands the kernel's extended syntax.

Syntax and kernel choice are separate. A cell with `%%bash` can be highlighted as shell while being submitted to the notebook's Python kernel, which handles the magic. Selecting HTML or Python syntax does not start a different kernel or convert a code cell into Markdown or raw.

## Inspecting results and data

`jupyter-monitor` lists running kernels and offers interrupt, restart and shutdown through the public session service. `jupyter-prompt` provides a command prompt with history; each run captures its selected session and generation and uses the shared execution service. Both packages activate independently of `jupyter-repl` and retain their own view lifecycle.

[Traceback navigation](tracebacks.md) uses hyperclick's Alt-hover and Alt-click gesture, verified local or captured source, stable notebook cell IDs, folded library frames and syntax-error ranges. Re-run changed source to restore its link.

`jupyter-explorer` reads dataframes and arrays in pages from the kernel, with sorting, filtering, search and column profiles over the full selected data. Column histograms and frequent values can apply filters together. Charts use an explicitly labelled bounded sample. The package can also open Parquet, Feather and Arrow files when the kernel environment has the required readers.

Use [Jupyter widgets](5_widgets.md) for interactive Matplotlib and [anywidget](anywidget.md) modules; install `ipympl` or `anywidget` in the kernel environment. [Bokeh and Panel](bokeh-and-panel.md) documents their notebook extensions, isolated browser renderers and live-kernel callbacks. [Output interactions](2_running.md#output-interactions) explains responsive HTML frames, resizing and Reset Result Size.

## AI access through MCP

`jupyter-inspector` shows documentation for an expression, `jupyter-variables` browses and edits a Python namespace, and `jupyter-watches` re-evaluates selected expressions after execution. Watches retain their expressions and run history across output-renderer replacement; reopening the panel recreates editors around the live-kernel models. See [Jupyter services and lifecycle](3_integration.md) for shared ownership.

The [MCP tools guide](mcp-tools.md) owns explicit kernel and notebook identities, source revision guards, execution receipts, progress and cancellation. The [Jupyter MCP workflow](https://github.com/lumine-code/lumine-mcp/blob/master/docs/jupyter.md) also covers live notebook edits and cached variable/watch reads. Cancelling an observation releases its listener; interrupting or restarting Python remains a separate action.

## Python analysis tools

Use `ide` with `ide-basedpyright` for static Python analysis and navigation. `symbol:go-to-definition` opens definitions, `find-references:show-panel` lists usages, and `refactor:rename` renames through the server. Install the corresponding `symbol`, `find-references`, and `refactor` frontend packages; `hyperclick` adds pointer navigation through `symbol`.

`ide-basedpyright` and `ide-ruff` use a shared Python projection supplied by `language-ipython`. Each tool receives one Python module for the entire file, so imports and names remain visible across cells. Python code cells and Python magic bodies participate in analysis. Markdown, raw, and foreign magic bodies are masked, including Python fences written inside a Markdown cell. IPython commands are replaced with valid analysis placeholders while preserving source positions. The kernel continues to receive the original source when you execute it.

The projection maps diagnostic, lookup, and edit positions back to the source document, including Unicode columns. Requests inside excluded regions return no Python results. Returned edits are checked against their source revision and cannot overwrite protected cell headers or foreign bodies. Ruff uses one formatter request and restores the original IPython commands and surrounding non-Python source before applying edits.

IPython commands remain runtime operations. Static analysis cannot discover names created dynamically by commands such as `%run`; write normal Python imports or annotations when the analyzer needs that information. Basedpyright analyzes explicitly opened `.ipy` documents, but its normal workspace discovery and Python module imports do not treat closed `.ipy` files as `.py` modules.

`ide-ruff:lint-projects` and `ide-ruff:lint-selected` include `.ipy` files through the same safe projection. Open documents use their current buffers; closed files use temporary source snapshots. The scans report diagnostics without rewriting files.

## Importing and exporting notebooks

Use `jupyter-cells:import-notebook` and `jupyter-cells:export-notebook` to convert between source cells and `.ipynb`. The [notebook conversion guide](https://github.com/lumine-code/jupyter-cells/blob/master/docs/notebook-conversion.md) owns cell-type mapping, saved outputs, kernel metadata, marker conflicts and exact newline preservation.
