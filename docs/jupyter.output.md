# jupyter.output

Render Jupyter output bundles with the same machinery the REPL renders its own results.

|             |                                                              |
| ----------- | ------------------------------------------------------------ |
| Version     | `1.0.0` provided, `^1.0.0` consumed                          |
| Provided by | `jupyter-repl`                                               |
| Consumed by | any package that shows Jupyter outputs — a notebook, a panel |
| Owner       | `jupyter-repl`                                               |

One implementation renders for the whole family, so a MIME type gained here is gained everywhere, and the heavy renderers — MathJax, plotly, vega — are installed exactly once, in this package. Rendering methods return `@lumine-code/etch` virtual DOM for a consumer's render tree; data methods operate on plain notebook records.

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
  renderDisplay(output: Output, options?: RenderingOptions): VNode | null;
  renderOutput(output: Output, renderers: RendererTable, options?: RenderingOptions): VNode | null;
  renderRichMedia(
    data: MimeBundle,
    metadata: object,
    renderers: RendererTable,
    options?: RenderingOptions,
  ): VNode | null;
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

  // owned pure data — no DOM, emitter, session or provider references
  createOutputAccumulator(): { readonly outputs: Output[]; append(event: OutputEvent): void };
  reduceOutputs(outputs: Output[], output: Output): Output[];
  reduceOutputEvents(events: OutputEvent[]): Output[];
  importOutputs(editor: TextEditor, bundle: { outputs: Output[]; row: number }): void;
  markdownToOutput(source: string | string[]): Output;
  normalizeOutput(output: Output): Output;
  msgSpecToNotebookFormat(message: object): Output;
  getOutputPlainText(outputs: Output[]): string;
  OUTPUT_TYPES: string[];

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

Consumers own plain output records and history independently of renderer availability. `createOutputAccumulator()` produces an owned pure data artifact: its array and append function retain no DOM, emitter, Session or rendering-provider reference, and may outlive the rendering service edge. Cache that pure factory value to build later runs while a renderer is unavailable; drop the provider handle on revocation. Incremental append preserves stream cursors, deferred clears and display updates without replaying historical chunks. `reduceOutputEvents` replays a single run, merging streams, applying display updates and honoring deferred clear messages. Rendering-service replacement preserves those records, expressions and history; consumers only rebuild their views. Geometry and display mode belong to each view.

A render function is `(data, metadata, bundle?, options?) => VNode | null`. It receives the representation matched for its own media type, that type's metadata, the whole bundle and optional rendering context. **Returning `null` declines the media type**: `renderRichMedia` moves on to the next representation rather than rendering an empty output. That is what lets a media type sit high in the priority order without having to render every bundle carrying it — an ipywidget view is preferred over the plain-text repr the kernel sends alongside it, but only when there is a live model to render, and otherwise the repr is shown.

`RenderingOptions` may carry `kernel`, the public Session that produced this output, `kernelGeneration`, its captured generation, and `resolveTracebackFrame(frame)`. Preserve the captured generation with each output or history run; `null` means its generation is unknown and live plot callbacks are unavailable. A redraw must not replace that provenance with the session's current generation. The resolver returns `{ title?: string, open(): void | Promise<void> }` for a verified source destination or `null` when it cannot resolve one. A frame has a one-based `line`, optional `filename` or `executionCount`, and zero-based `column` and end-exclusive `endColumn` when a SyntaxError underline is available. Consumers must resolve execution counts against captured execution identities and source snapshots, never against cell indices or whichever kernel is active. The renderer registers verified location spans with jupyter-repl's hyperclick provider; hold Alt, hover and Alt-click through `hyperclick` to navigate. Plain clicks retain normal text selection. The entire traceback is a hyperclick boundary, so an unresolved frame cannot fall back to a word in an editor behind the output. Cached suggestions become invalid when their rendered output, source, kernel generation or provider changes. See [Tracebacks](tracebacks.md).

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeJupyterOutput(output) {
    const edge = {};
    this.outputEdge = edge;
    this.output = output;
    this.refresh();
    return new Disposable(() => {
      // The service goes away with jupyter-repl; drop the reference and show
      // whatever degraded state makes sense for this package.
      if (this.outputEdge !== edge) return;
      this.outputEdge = null;
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

The rich renderer supports core `ipywidgets`, Vega and Vega-Lite 5–6 (both the `.json` MIME spelling emitted by current Altair and the established `+json` spelling), Plotly JSON and Plotly HTML carrying literal JSON arguments, HTML, Markdown, LaTeX, SVG, WebP, PNG, JPEG, GIF, JSON, JavaScript source, and plain text. Earlier Vega MIME versions are deliberately unsupported; a bundle carrying one falls through to its next representation.

Notebook HTML is treated as untrusted markup. Scripts, styles, forms, event handlers and unsafe URI schemes are removed; semantic markup, tables, images, audio, video, HTTP(S) frames, classes, ARIA metadata and ordinary links remain. An absolute local path in an image or media source is normalized to an encoded `file:` URL, and `file:` remains forbidden outside image and media sources. Frames accept only explicit HTTP(S) URLs, never `srcdoc`, and run in a sandbox that keeps scripts and their own origin but blocks navigation and other ambient capabilities. SVG is rendered as an encoded image rather than inserted into the editor's DOM. Plotly HTML is parsed for JSON literals and is never executed.

`escapeCarriageReturn` and `reduceOutputs` resolve carriage returns the way a terminal does: a write lands at the cursor and advances it, and `\r` returns the cursor to column 0 without erasing what is already there. So a progress bar collapses to the line it last wrote, a `\r\n` keeps its line's text, and a line ending in a bare `\r` keeps it too until something overwrites it. `reduceOutputs` resolves each stream output as it merges, which means the result depends only on the stream's content and not on where its chunk boundaries happened to fall — a consumer feeding it one message at a time gets what it would have got from the whole stream at once.

Rendered markup uses the `output-*` class family (`output-stream output-stdout`, `output-error` with `error-name`/`error-value`/`error-traceback` children, `output-html`, `output-markdown`, `output-latex`, `output-image`, …). Consumers style those classes in their own stylesheets; this package only styles them inside its own panes.

Everything crosses the boundary as plain objects, DOM, or etch component classes. Vnodes are elements, never bare fragments — fragment identity does not survive a package boundary.

## Teardown

Return a `Disposable` that drops your reference and re-renders. Do not cache vnodes across the revocation; build them fresh per render.

## Versioning

`1.0.0` provided, `^1.0.0` consumed. A change that breaks this shape gets a new service name rather than a new major version, and both sides move in the same release.
