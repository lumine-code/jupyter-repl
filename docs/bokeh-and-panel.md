# Bokeh and Panel

Bokeh and Panel notebook outputs render in isolated frames, including their HTML, JavaScript resources and browser interactions. Install the Python libraries in the environment used by the kernel.

```python
from bokeh.io import output_notebook, show
from bokeh.plotting import figure

output_notebook()
p = figure(width=500, height=300)
p.line([1, 2, 3], [1, 4, 9])
show(p)
```

For Panel, initialize its notebook extension before displaying a component:

```python
import panel as pn

pn.extension()
pn.widgets.IntSlider(name="Value", start=0, end=100)
```

Resource-loading outputs belong to their originating kernel or notebook document. Each displayed plot has a separate frame, so plotting libraries and their styles cannot alter the editor or another output. Libraries may load HTTPS resources; use inline Bokeh resources when network access is unavailable.

The notebook comm bridge supports the output's declared Bokeh and PyViz channels against its originating kernel. It exposes no code-execution, filesystem or generic editor API. Closing the output releases its targets and comms; a kernel restart requires running the plot again. A stored notebook can retain browser interactions, but Python callbacks need a live kernel connection.

Plain HTML output remains sanitized. Executable rendering is selected only by the Bokeh or HoloViews notebook MIME markers. Other libraries continue to use their existing renderers or text fallback.
