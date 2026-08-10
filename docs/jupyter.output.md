# jupyter.output

Render Jupyter output bundles with the same machinery the REPL renders its own results.

|             |                                                              |
| ----------- | ------------------------------------------------------------ |
| Version     | `1.0.0` provided, `^1.0.0` consumed                          |
| Provided by | `jupyter-repl`                                               |
| Consumed by | any package that shows Jupyter outputs — a notebook, a panel |
| Owner       | `jupyter-repl`                                               |

One implementation renders for the whole family, so a MIME type gained here is gained everywhere, and the heavy renderers — MathJax, plotly, vega — are installed exactly once, in this package. Everything returned is `@lumine-code/etch` virtual DOM; a consumer embeds it in its own render tree or appends a component's `element`.

## Registration

```json
"consumedServices": {
  "jupyter.output": {
    "versions": {
      "^1.0.0": "consumeJupyterOutput"
    }
  }
}
```

## Contract

```ts
type JupyterOutputService = {
  // rendering — each returns an etch vnode (or null when nothing applies)
  renderDisplay(output: Output): VNode | null;
  renderOutput(output: Output, renderers: RendererTable): VNode | null;
  renderRichMedia(data: MimeBundle, metadata: object, renderers: RendererTable): VNode | null;
  renderStatus(status: string, style?: object): VNode;
  MEDIA_RENDERERS: RendererTable; // every supported media type
  SUPPORTED_MEDIA_TYPES: string[];
  pickRenderers(mediaTypes: string[]): RendererTable;
  isTextOutputOnly(data: MimeBundle): boolean;

  // text
  ansiNodes(text: string): Array<VNode | string>;
  ansiToText(text: string): string;
  escapeCarriageReturn(text: string): string;
  truncateOutput(text: string, maxLength?: number): { text: string; truncated: boolean };
  sanitizeHtml(html: string): string;

  // data
  OutputStore: new (maxOutputs?: number) => OutputStore;
  reduceOutputs(outputs: Output[], output: Output): Output[];
  normalizeOutput(output: Output): Output;
  msgSpecToNotebookFormat(message: object): Output;
  getOutputPlainText(outputs: Output[]): string;
  OUTPUT_TYPES: string[];

  // components — etch component classes, usable as JSX tags
  History: EtchComponentClass; // { store: OutputStore } — scrub past values
  ScrollList: EtchComponentClass; // { outputs: Output[] } — a run's outputs, scrolled

  // actions — `outputs`, where accepted, supplies the bundle's own text for
  // renders whose DOM has none to select (LaTeX becomes SVG paths)
  getImage(element: HTMLElement): HTMLImageElement | HTMLCanvasElement | null;
  getAllText(element: HTMLElement): string;
  getSourceText(outputs: Output[] | null): string;
  hasCopyableContent(outputs: Output[]): boolean;
  copyToClipboard(element: HTMLElement, outputs?: Output[]): void;
  saveImage(element: HTMLElement, editor?: TextEditor): Promise<void>;
  openInEditor(element: HTMLElement, outputs?: Output[]): void;
};
```

An `Output` is a Jupyter notebook-format output (`output_type` of `execute_result`, `display_data`, `stream`, or `error`); `msgSpecToNotebookFormat` converts a raw iopub message into one. A `RendererTable` maps media types to render functions — `MEDIA_RENDERERS` is the full table, `pickRenderers` subsets it.

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeJupyterOutput(output) {
    this.output = output;
    this.refresh();
    return new Disposable(() => {
      // The service goes away with jupyter-repl; drop the reference and show
      // whatever degraded state makes sense for this package.
      this.output = null;
      this.refresh();
    });
  },

  render(outputs) {
    if (!this.output) {
      return this.renderFallback(outputs);
    }
    return outputs.map((entry) => this.output.renderDisplay(this.output.normalizeOutput(entry)));
  },
};
```

## Behavior

`jupyter-repl` activates eagerly, so the service exists at startup — a consumer that also activates at startup can render stored outputs before any kernel exists.

Truncation, output wrapping, and the output font size follow this package's settings (`jupyter-repl.outputMaxLength`, `wrapOutput`, `outputAreaFontSize`). That is deliberate: one settings page controls output rendering for every consumer.

The heavy renderers load on demand — the first vega output parses the vega bundles, the first LaTeX output loads MathJax. Rendering follows MIME priority, so a bundle whose richest type cannot be rendered falls back to a lower one.

`escapeCarriageReturn` and `reduceOutputs` resolve carriage returns the way a terminal does: a write lands at the cursor and advances it, and `\r` returns the cursor to column 0 without erasing what is already there. So a progress bar collapses to the line it last wrote, a `\r\n` keeps its line's text, and a line ending in a bare `\r` keeps it too until something overwrites it. `reduceOutputs` resolves each stream output as it merges, which means the result depends only on the stream's content and not on where its chunk boundaries happened to fall — a consumer feeding it one message at a time gets what it would have got from the whole stream at once.

Rendered markup uses the `output-*` class family (`output-stream output-stdout`, `output-error` with `error-name`/`error-value`/`error-traceback` children, `output-html`, `output-markdown`, `output-latex`, `output-image`, …). Consumers style those classes in their own stylesheets; this package only styles them inside its own panes.

Everything crosses the boundary as plain objects, DOM, or etch component classes. Vnodes are elements, never bare fragments — fragment identity does not survive a package boundary.

## Teardown

Return a `Disposable` that drops your reference and re-renders. Do not cache vnodes across the revocation; build them fresh per render.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
