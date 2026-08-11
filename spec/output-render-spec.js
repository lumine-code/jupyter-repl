const etch = require("@lumine-code/etch");
const { renderDisplay, isTextOutputOnly } = require("../lib/components/result-view/display");
const { renderOutput } = require("../lib/components/output");
const { HTML } = require("../lib/components/result-view/html");
const { VegaEmbed } = require("../lib/components/result-view/vega");
const OutputStore = require("../lib/store/output");
const History = require("../lib/components/result-view/history");
const ScrollList = require("../lib/components/result-view/list");

// The output renderers moved off React, which also replaced the upstream
// children-as-configuration shape with a media-type table. Nothing had ever
// asserted what any of them produce, so a media type could stop rendering
// without a single spec noticing.

// A throwaway host, so renderDisplay runs through a real etch patch rather than
// being inspected as a virtual node.
class Probe {
  constructor(output) {
    this.output = output;
    etch.initialize(this);
  }
  render() {
    return etch.dom.div({ className: "probe" }, renderDisplay(this.output));
  }
  update() {
    return etch.update(this);
  }
}

const html = (output) => new Probe(output).element.innerHTML;

describe("output rendering", () => {
  it("renders a stream, keeping its ANSI colour", () => {
    const rendered = html({
      output_type: "stream",
      name: "stdout",
      text: "hello [31mred[0m",
    });

    expect(rendered).toContain('class="output-stream output-stdout"');
    expect(rendered).toContain("hello");
    // The escape becomes a coloured span, not literal escape characters.
    expect(rendered).toContain("<span");
    expect(rendered).not.toContain("[31m");
  });

  it("renders an error as its traceback", () => {
    const rendered = html({
      output_type: "error",
      ename: "ValueError",
      evalue: "bad",
      traceback: ["Traceback", "ValueError: bad"],
    });

    expect(rendered).toContain("output-error");
    expect(rendered).toContain("ValueError: bad");
  });

  it("names the error when there is no traceback to repeat it", () => {
    const rendered = html({
      output_type: "error",
      ename: "ValueError",
      evalue: "bad",
      traceback: [],
    });

    expect(rendered).toContain("error-name");
    expect(rendered).toContain("ValueError");
  });

  it("renders each rich media type", () => {
    const bundles = {
      "text/plain": ["42", "output-text"],
      "text/html": ["<b>bold</b>", "output-html"],
      "text/markdown": ["# Head", "output-markdown"],
      "image/svg+xml": ["<svg xmlns='http://www.w3.org/2000/svg'></svg>", "output-svg"],
    };

    for (const [mediaType, [data, expectedClass]] of Object.entries(bundles)) {
      const rendered = html({
        output_type: "display_data",
        data: { [mediaType]: data },
        metadata: {},
      });
      expect(rendered).toContain(expectedClass);
    }
  });

  it("renders an image with the size its metadata asks for", () => {
    const rendered = html({
      output_type: "display_data",
      data: { "image/png": "AAAA" },
      metadata: { "image/png": { width: 10, height: "2em" } },
    });

    expect(rendered).toContain("data:image/png;base64,AAAA");
    expect(rendered).toContain("width: 10px");
    expect(rendered).toContain("height: 2em");
  });

  it("prefers the richest representation a bundle offers", () => {
    const rendered = html({
      output_type: "execute_result",
      data: { "text/plain": "<Figure>", "text/html": "<b>rich</b>" },
      metadata: {},
    });

    expect(rendered).toContain("output-html");
    expect(rendered).not.toContain("&lt;Figure&gt;");
  });

  it("renders nothing for an output type it does not handle", () => {
    expect(renderOutput({ output_type: "clear_output" }, {})).toBe(null);
    expect(renderOutput(null, {})).toBe(null);
  });

  it("reports whether a bundle is plain text only", () => {
    expect(isTextOutputOnly({ "text/plain": "42" })).toBe(true);
    expect(isTextOutputOnly({ "text/plain": "x", "text/html": "<b/>" })).toBe(false);
    // An unsupported type does not make a plain bundle rich.
    expect(isTextOutputOnly({ "text/plain": "x", "application/octet-stream": "?" })).toBe(true);
  });

  // A tree that embeds this component records its root element; the component
  // re-renders on its own schedule (another package's copy of etch can drive
  // it), so a root swap would leave that tree holding a removed node and its
  // next structural patch would die in insertBefore.
  it("keeps its root element when content switches between html and vega", async () => {
    spyOn(VegaEmbed.prototype, "callEmbedder");
    const vegaHtml =
      '<div id="vis"></div><script>vegaEmbed("#vis", ' +
      '{"$schema": "https://vega.github.io/schema/vega-lite/v5.json", "mark": "bar"});</script>';

    const component = new HTML({ data: "<b>plain</b>" });
    const root = component.element;
    expect(root.className).toBe("output-html");
    expect(root.innerHTML).toContain("plain");

    await component.update({ data: vegaHtml });
    expect(component.vegaSpec).toBeTruthy();
    expect(component.element).toBe(root);
    expect(root.innerHTML).not.toContain("plain");

    await component.update({ data: "<i>back</i>" });
    expect(component.element).toBe(root);
    expect(root.innerHTML).toContain("back");
    component.destroy();
  });
});

describe("output history", () => {
  let component;

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  it("scrubs back through the values a watch has produced", () => {
    const store = new OutputStore(25);
    store.appendOutput({ output_type: "stream", name: "stdout", text: "one" });
    store.startNewRun();
    store.appendOutput({ output_type: "stream", name: "stdout", text: "two" });

    component = new History({ store });
    etch.updateSync(component);
    expect(component.element.textContent).toContain("two");

    store.decrementIndex();
    etch.updateSync(component);
    expect(component.element.textContent).toContain("one");
  });

  it("redraws when its store gains an output", () => {
    const store = new OutputStore(25);
    component = new History({ store });
    etch.updateSync(component);

    store.appendOutput({ output_type: "stream", name: "stdout", text: "later" });
    etch.updateSync(component);

    expect(component.element.textContent).toContain("later");
  });
});

describe("output scroll list", () => {
  it("renders one item per output", () => {
    const list = new ScrollList({
      outputs: [
        { _id: 1, output_type: "stream", name: "stdout", text: "a" },
        { _id: 2, output_type: "stream", name: "stdout", text: "b" },
      ],
    });
    etch.updateSync(list);

    expect(list.element.querySelectorAll(".scroll-list-item").length).toBe(2);
    list.destroy();
  });
});

describe("declining a media type", () => {
  // A renderer that returns nothing has declined, and the next representation
  // is tried instead. That is what lets a media type sit high in the priority
  // list without having to render every bundle carrying it — the live form of
  // a value is always preferable, but only when it can actually be produced.
  const renderers = {
    "text/html": (data) => (data ? etch.dom.div({ className: "from-html" }, data) : null),
    "text/plain": (data) => etch.dom.div({ className: "from-plain" }, data),
  };

  it("takes the higher-priority type when it renders", () => {
    const vnode = renderOutput(
      { output_type: "display_data", data: { "text/html": "<b>x</b>", "text/plain": "x" } },
      renderers,
    );

    expect(vnode.props.className).toBe("from-html");
  });

  it("falls through to the next type when the higher one declines", () => {
    const vnode = renderOutput(
      { output_type: "display_data", data: { "text/html": "", "text/plain": "x" } },
      renderers,
    );

    expect(vnode.props.className).toBe("from-plain");
  });

  it("renders nothing when every type declines", () => {
    const vnode = renderOutput(
      { output_type: "display_data", data: { "text/html": "" } },
      { "text/html": renderers["text/html"] },
    );

    expect(vnode).toBe(null);
  });

  it("offers a type outside the priority list only once", () => {
    // The second pass exists for a supported type the priority list does not
    // name; it must not re-offer one the first pass already declined.
    let calls = 0;
    const counting = {
      "text/html": () => {
        calls++;
        return null;
      },
    };

    renderOutput({ output_type: "display_data", data: { "text/html": "x" } }, counting);

    expect(calls).toBe(1);
  });

  it("hands a renderer the whole bundle alongside its own representation", () => {
    // A renderer that can only partly represent its media type falls back to
    // what the kernel sent with it rather than showing a bare error.
    let seen = null;
    renderOutput(
      { output_type: "display_data", data: { "text/plain": "x", "text/html": "<b>x</b>" } },
      {
        "text/html": (data, metadata, bundle) => {
          seen = bundle;
          return etch.dom.div({}, data);
        },
      },
    );

    expect(seen).toEqual({ "text/plain": "x", "text/html": "<b>x</b>" });
  });
});

describe("teardown", () => {
  // etch defers an ordinary destroy to the next animation frame, and by then
  // the caller has already torn down what owned the component. If that frame
  // never arrives — package deactivation, window close — nothing is cleaned up
  // at all, and a renderer holding a live view keeps receiving updates into DOM
  // nobody can see. The package's own roots therefore destroy synchronously.
  it("disposes a child renderer without waiting for a frame", () => {
    const destroyed = spyOn(HTML.prototype, "destroy").and.callThrough();
    const list = new ScrollList({
      outputs: [{ _id: 1, output_type: "display_data", data: { "text/html": "<b>x</b>" } }],
    });
    etch.updateSync(list);

    list.destroy();

    expect(destroyed).toHaveBeenCalled();
  });
});
