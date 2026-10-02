# Jupyter widgets

`ipywidgets` objects render as live controls in the result, wired to the kernel in both directions: dragging a slider changes the Python value, and setting the Python value moves the slider.

```python
from ipywidgets import IntSlider
s = IntSlider()
s
```

Reading `s.value` in a later run reports whatever the slider was last dragged to.

## What is supported

The core widget set — everything in `@jupyter-widgets/controls` — ships with the package:

- numbers: `IntSlider`, `FloatSlider`, the range and log variants, `IntText`, `BoundedIntText`, `FloatProgress`
- booleans and choices: `Checkbox`, `ToggleButton`, `Valid`, `Dropdown`, `RadioButtons`, `Select`, `SelectMultiple`, `ToggleButtons`
- strings: `Text`, `Textarea`, `Password`, `Label`, `HTML`, `HTMLMath`
- actions and media: `Button`, `Image`, `Play`, `DatePicker`, `ColorPicker`
- containers: `Box`, `HBox`, `VBox`, `GridBox`, `Accordion`, `Tab`
- `Output`, and with it `interact`, `interactive` and `interactive_output`

`interact` works as it does anywhere else:

```python
from ipywidgets import interact

@interact(n=(0, 100))
def show(n):
    print(n * n)
```

Anything a widget prints inside `with out:` is captured by that widget rather than appearing under the cell, so `tqdm.notebook` progress bars and `interactive_output` behave normally.

## Interactive Matplotlib

Install `ipympl` in the kernel's Python environment, then enable its backend before drawing a figure:

```python
%matplotlib ipympl
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [1, 4, 9])
plt.show()
```

The package bundles `jupyter-matplotlib` 0.12 for `ipympl` 0.10. The figure and toolbar use the same live widget connection as the core controls.

## Custom widgets

Install `anywidget` in the kernel environment to use widgets whose frontend is an inline ES module or an HTTPS module. Their code runs in an isolated frame with no Node or editor access; its bridge exposes only the widget's traits, custom messages and referenced anywidget children. See [anywidget](anywidget.md) for the supported frontend interface and lifecycle.

## Other widget modules

Widget modules outside the bundled core controls, `jupyter-matplotlib` and `anywidget` are not loaded. `ipyleaflet`, `bqplot` and `ipycanvas` render a message naming the module they requested. Plotly's modern `FigureWidget` uses anywidget; older versions requiring another module still use their plain-figure fallback.

Unknown widget modules cannot run in the editor process. Custom anywidget code has its own sandbox; the core widget manager resolves only the modules shipped with this package.

Those libraries usually have a non-widget rendering path that works here: Plotly figures render through `plotly.io.show` or a plain `Figure`, and most plotting libraries fall back to a static image.

## Widgets and the kernel's lifetime

A widget is an object in the kernel, and the view in the editor is a window onto it.

- **Restarting the kernel destroys every widget**, as it destroys every other variable. The controls already on screen stop responding; re-run the cell to build new ones.
- **Attaching to a kernel that already has widgets works.** `Connect to Existing Kernel`, and reopening a file whose kernel outlived the window, both ask the kernel what it has open and rebuild the views.
- **A shared kernel stays in step.** If a `jupyter console` attached to the same kernel — or a second Lumine window — changes a widget's value, the controls here follow it, because the value belongs to the kernel rather than to whoever set it.

## Saved notebooks

A widget in an imported `.ipynb` renders as the text representation the notebook stored (`IntSlider(value=0)`), not as a control. Nothing is lost and nothing errors — there is no kernel behind a stored notebook, so there is nothing for a control to be wired to.

## Styling

Widgets follow the active Lumine theme: their colours, borders and fonts are derived from the same theme variables the rest of the editor uses, so they change with it. To adjust them, target the widget classes in your `styles.css`:

```css
.jupyter-repl .widget-slider .noUi-connect {
  background: var(--text-color-success);
}
```
