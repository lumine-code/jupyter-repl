# Tracebacks

Python and IPython errors keep their original traceback text and ANSI colours. Recognized frames link to an existing local source file or to the source captured when the code was submitted. No kernel helper or custom MIME format is required. Other kernel traceback formats remain readable as text.

Click an underlined frame to open its source. Frames from site-packages, dist-packages and recognizable Python standard-library directories are grouped in a collapsed section; expand it to inspect library code. The exception message remains visible. SyntaxError, IndentationError and TabError underlines select the indicated columns when the printed source matches the executed source.

REPL execution counts identify captured executions, including earlier executions that defined a function. Notebook frames resolve through the stable cell ID that produced that execution, so moving a cell does not change its destination. Editing or deleting the executed source disables the link. Transformed cell magics or selections that cannot be mapped exactly retain their text without an invented source location.

Runtime provenance is kept in memory for the latest 200 execution counts per kernel. It is not written into notebook JSON. Reopened notebooks therefore retain their error text and local-file links, but a saved execution count alone does not create a notebook-cell link. Reconnect or restart never replays code to reconstruct links. Remote gateway file paths are not opened as local paths.
