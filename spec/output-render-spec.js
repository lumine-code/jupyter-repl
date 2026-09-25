const etch = require("@lumine-code/etch");
const path = require("path");
const { pathToFileURL } = require("url");
const { renderDisplay, isTextOutputOnly } = require("../lib/components/result-view/display");
const { renderOutput } = require("../lib/components/output");
const { HTML, detectMediaType } = require("../lib/components/result-view/html");
const {
  VegaEmbed,
  embed: embedVega,
  loadVegaEmbed,
  runtime: vegaRuntime,
} = require("../lib/components/result-view/vega");
const {
  PlotlyTransform,
  extractPlotlyFigure,
  plotlyHtmlRenderer,
} = require("../lib/components/result-view/plotly");
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

  it("renders WebP with the size its metadata asks for", () => {
    const rendered = html({
      output_type: "display_data",
      data: { "image/webp": "AAAA" },
      metadata: { "image/webp": { width: 12, height: "3em" } },
    });

    expect(rendered).toContain("data:image/webp;base64,AAAA");
    expect(rendered).toContain("width: 12px");
    expect(rendered).toContain("height: 3em");
  });

  it("renders SVG as an inert encoded image", () => {
    const probe = new Probe({
      output_type: "display_data",
      data: {
        "image/svg+xml":
          '<svg xmlns="http://www.w3.org/2000/svg" onload="globalThis.svgRan=true"><script>globalThis.svgRan=true</script><rect width="1" height="1"/></svg>',
      },
      metadata: {},
    });
    const image = probe.element.querySelector("img.output-svg");

    expect(image).toBeTruthy();
    expect(image.getAttribute("src")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(probe.element.querySelector("svg")).toBeFalsy();
    expect(probe.element.querySelector("script")).toBeFalsy();
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

  it("sanitizes HTML without discarding semantic output", () => {
    const probe = new Probe({
      output_type: "display_data",
      data: {
        "text/html":
          "<style>body{display:none}</style><script>bad()</script>" +
          '<iframe src="javascript:bad()"></iframe><form><input></form>' +
          '<table class="dataframe"><tr><td onclick="bad()">42</td></tr></table>' +
          '<img src="data:image/png;base64,AAAA" onerror="bad()">' +
          '<a href="javascript:bad()">bad</a>' +
          '<a href="https://example.com" target="_blank">good</a>',
      },
      metadata: {},
    });
    const root = probe.element;
    const links = root.querySelectorAll("a");

    expect(root.querySelector("script")).toBeFalsy();
    expect(root.querySelector("style")).toBeFalsy();
    expect(root.querySelector("iframe")).toBeFalsy();
    expect(root.querySelector("form")).toBeFalsy();
    expect(root.querySelector("table.dataframe").textContent).toBe("42");
    expect(root.querySelector("td").hasAttribute("onclick")).toBe(false);
    expect(root.querySelector("img").hasAttribute("onerror")).toBe(false);
    expect(root.querySelector("img").getAttribute("src")).toContain("data:image/png;base64");
    expect(links[0].hasAttribute("href")).toBe(false);
    expect(links[1].getAttribute("href")).toBe("https://example.com");
    expect(links[1].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("preserves standard IPython HTTPS frames", () => {
    const probe = new Probe({
      output_type: "display_data",
      data: {
        "text/html": `
          <iframe
            width="900"
            height="490"
            src="https://nteract.io/"
            frameborder="0"
            allowfullscreen
          ></iframe>
          <iframe class="relative-frame" src="./local.html"></iframe>
        `,
      },
      metadata: {},
    });
    const iframe = probe.element.querySelector("iframe");

    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute("src")).toBe("https://nteract.io/");
    expect(iframe.getAttribute("width")).toBe("900");
    expect(iframe.getAttribute("height")).toBe("490");
    expect(iframe.getAttribute("frameborder")).toBe("0");
    expect(iframe.hasAttribute("allowfullscreen")).toBe(true);
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(probe.element.querySelector("iframe.relative-frame")).toBeFalsy();
  });

  it("preserves standard IPython audio and video", () => {
    const probe = new Probe({
      output_type: "display_data",
      data: {
        "text/html": `
          <audio controls="controls">
            <source src="https://example.com/audio.mp3" type="audio/mpeg" />
          </audio>
          <audio class="embedded-audio" src="data:audio/wav;base64,AAAA" controls></audio>
          <video src="https://example.com/video.mp4" controls width="640" height="360"></video>
          <video class="embedded-video" src="data:video/mp4;base64,AAAA" controls></video>
        `,
      },
      metadata: {},
    });
    const audio = probe.element.querySelector("audio");
    const source = audio.querySelector("source");
    const video = probe.element.querySelector("video");

    expect(audio.hasAttribute("controls")).toBe(true);
    expect(source.getAttribute("src")).toBe("https://example.com/audio.mp3");
    expect(source.getAttribute("type")).toBe("audio/mpeg");
    expect(video.getAttribute("src")).toBe("https://example.com/video.mp4");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.getAttribute("width")).toBe("640");
    expect(video.getAttribute("height")).toBe("360");
    expect(probe.element.querySelector("audio.embedded-audio").getAttribute("src")).toContain(
      "data:audio/wav;base64,AAAA",
    );
    expect(probe.element.querySelector("video.embedded-video").getAttribute("src")).toContain(
      "data:video/mp4;base64,AAAA",
    );
  });

  it("normalizes absolute image paths without allowing file links", () => {
    const absolutePath = path.join(path.parse(process.cwd()).root, "Data", "plot #1.png");
    const fileUrl = pathToFileURL(absolutePath).href;
    const probe = new Probe({
      output_type: "display_data",
      data: {
        "text/html":
          `<img class="native-path" src="${absolutePath}" srcset="${fileUrl} 2x" width="800">` +
          `<img class="file-url" src="${fileUrl}" width="400">` +
          `<a class="file-link" href="${fileUrl}">local file</a>`,
      },
      metadata: {},
    });
    const root = probe.element;

    expect(root.querySelector("img.native-path").getAttribute("src")).toBe(fileUrl);
    expect(root.querySelector("img.native-path").hasAttribute("srcset")).toBe(false);
    expect(root.querySelector("img.file-url").getAttribute("src")).toBe(fileUrl);
    expect(root.querySelector("a.file-link").hasAttribute("href")).toBe(false);
  });

  it("loads an absolute local image after sanitization", async () => {
    const imagePath = path.join(__dirname, "..", "assets", "logo.svg");
    const probe = new Probe({
      output_type: "display_data",
      data: { "text/html": `<img src="${imagePath}" width="800">` },
      metadata: {},
    });
    jasmine.attachToDOM(probe.element);
    const image = probe.element.querySelector("img");

    await new Promise((resolve, reject) => {
      if (image.complete) {
        return image.naturalWidth > 0 ? resolve() : reject(new Error("Local image did not load"));
      }
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", () => reject(new Error("Local image did not load")), {
        once: true,
      });
    });

    expect(image.naturalWidth).toBeGreaterThan(0);
    probe.element.remove();
  }, 5000);
});

describe("modern rich media formats", () => {
  it("renders the MIME spelling emitted by Altair 6 instead of its text fallback", () => {
    spyOn(VegaEmbed.prototype, "callEmbedder");
    const rendered = html({
      output_type: "display_data",
      data: {
        "application/vnd.vegalite.v6.json": {
          $schema: "https://vega.github.io/schema/vega-lite/v6.json",
          data: { values: [{ x: 1, y: 2 }] },
          mark: "point",
          encoding: {
            x: { field: "x", type: "quantitative" },
            y: { field: "y", type: "quantitative" },
          },
        },
        "text/plain": "<VegaLite 6 object> renderer has not been properly enabled",
      },
      metadata: {},
    });

    expect(rendered).toContain("output-vega");
    expect(rendered).not.toContain("renderer has not been properly enabled");
  });

  it("prefers Vega 6 to Vega 5", () => {
    const vnode = renderOutput(
      {
        output_type: "display_data",
        data: {
          "application/vnd.vega.v5+json": {},
          "application/vnd.vega.v6+json": {},
        },
        metadata: {},
      },
      {
        "application/vnd.vega.v5+json": () => etch.dom.div({ className: "vega-5" }),
        "application/vnd.vega.v6+json": () => etch.dom.div({ className: "vega-6" }),
      },
    );

    expect(vnode.props.className).toBe("vega-6");
  });

  it("recognizes only current Vega and Vega-Lite schemas", () => {
    expect(detectMediaType({ $schema: "https://vega.github.io/schema/vega/v6.json" })).toBe(
      "application/vnd.vega.v6+json",
    );
    expect(detectMediaType({ $schema: "https://vega.github.io/schema/vega-lite/v5.json" })).toBe(
      "application/vnd.vegalite.v5+json",
    );
    expect(detectMediaType({ $schema: "https://vega.github.io/schema/vega-lite/v4.json" })).toBe(
      null,
    );
  });

  it("falls back from removed Vega media types to plain text", () => {
    const rendered = html({
      output_type: "display_data",
      data: {
        "application/vnd.vegalite.v4+json": { mark: "bar" },
        "text/plain": "old chart",
      },
      metadata: {},
    });

    expect(rendered).toContain("output-text");
    expect(rendered).toContain("old chart");
    expect(rendered).not.toContain("output-vega");
  });

  it("extracts literal Plotly JSON from newPlot and react", () => {
    const newPlot = extractPlotlyFigure(
      '<script>Plotly.newPlot("chart", [{"x":[1,2],"name":"a,b"}], {"title":{"text":"A \\"quote\\""}}, {"responsive":true});</script>',
    );
    const react = extractPlotlyFigure(
      '<script>Plotly.react(document.getElementById("chart"), [{"y":[3,4]}], {"showlegend":false});</script>',
    );

    expect(newPlot).toEqual({
      data: [{ x: [1, 2], name: "a,b" }],
      layout: { title: { text: 'A "quote"' } },
    });
    expect(react).toEqual({ data: [{ y: [3, 4] }], layout: { showlegend: false } });

    const vnode = plotlyHtmlRenderer(
      '<script>Plotly.newPlot("chart", [{"x":[1]}], {"title":"safe"});</script>',
    );
    expect(vnode.tag).toBe(PlotlyTransform);
    expect(vnode.props.data).toEqual({ data: [{ x: [1] }], layout: { title: "safe" } });
  });

  it("declines executable Plotly HTML and uses plain text", () => {
    expect(
      extractPlotlyFigure('<script>Plotly.newPlot("chart", getData(), layout);</script>'),
    ).toBe(null);
    const rendered = html({
      output_type: "display_data",
      data: {
        "text/vnd.plotly.v1+html": '<script>Plotly.newPlot("chart", getData(), layout);</script>',
        "text/plain": "Plotly figure",
      },
      metadata: {},
    });

    expect(rendered).toContain("output-text");
    expect(rendered).toContain("Plotly figure");
  });
});

describe("vega lifecycle", () => {
  afterEach(() => vegaRuntime.reset());

  it("routes Vega and Vega-Lite 5 and 6 through the current embedder", async () => {
    const embedder = jasmine.createSpy("embed").and.returnValue(Promise.resolve({ finalize() {} }));
    spyOn(vegaRuntime, "load").and.returnValue(Promise.resolve(embedder));
    const formats = {
      "application/vnd.vega.v5.json": "vega",
      "application/vnd.vega.v5+json": "vega",
      "application/vnd.vega.v6.json": "vega",
      "application/vnd.vega.v6+json": "vega",
      "application/vnd.vegalite.v5.json": "vega-lite",
      "application/vnd.vegalite.v5+json": "vega-lite",
      "application/vnd.vegalite.v6.json": "vega-lite",
      "application/vnd.vegalite.v6+json": "vega-lite",
    };

    for (const [mediaType, mode] of Object.entries(formats)) {
      const anchor = document.createElement("div");
      const spec = { mark: "point" };
      await embedVega(anchor, mediaType, spec);
      expect(embedder).toHaveBeenCalledWith(anchor, spec, { actions: false, ast: true, mode });
    }
  });

  it("loads the official runtime and renders Vega-Lite 6 in the window", async () => {
    const anchor = document.createElement("div");
    jasmine.attachToDOM(anchor);
    const result = await embedVega(anchor, "application/vnd.vegalite.v6+json", {
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
      data: { values: [{ category: "A", value: 1 }] },
      mark: "bar",
      encoding: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
      },
    });

    expect(anchor.querySelector("canvas, svg")).toBeTruthy();
    result.finalize();
    anchor.remove();
  }, 15000);

  it("retries the runtime import after a failure", async () => {
    const failure = new Error("load failed");
    let seen = null;
    try {
      await loadVegaEmbed(() => Promise.reject(failure));
    } catch (error) {
      seen = error;
    }
    expect(seen).toBe(failure);

    const embedder = () => {};
    const loaded = await loadVegaEmbed(() => Promise.resolve({ default: embedder }));
    expect(loaded).toBe(embedder);
  });

  it("finalizes a superseded asynchronous result and the current result", async () => {
    let resolveFirst;
    const firstPromise = new Promise((resolve) => (resolveFirst = resolve));
    const firstResult = { finalize: jasmine.createSpy("first finalize") };
    const secondResult = { finalize: jasmine.createSpy("second finalize") };
    let callCount = 0;
    const embedder = jasmine.createSpy("embed").and.callFake(() => {
      callCount++;
      return callCount === 1 ? firstPromise : Promise.resolve(secondResult);
    });
    spyOn(vegaRuntime, "load").and.returnValue(Promise.resolve(embedder));

    const component = new VegaEmbed({
      mediaType: "application/vnd.vegalite.v6+json",
      spec: { mark: "bar" },
    });
    await Promise.resolve();
    await Promise.resolve();

    await component.update({
      mediaType: "application/vnd.vegalite.v6+json",
      spec: { mark: "line" },
    });
    resolveFirst(firstResult);
    await Promise.resolve();
    await Promise.resolve();

    expect(firstResult.finalize).toHaveBeenCalled();
    expect(component.embedResult).toBe(secondResult);
    component.destroy();
    expect(secondResult.finalize).toHaveBeenCalled();
  });

  it("shows a load error with the bundle's plain-text fallback", async () => {
    spyOn(vegaRuntime, "load").and.returnValue(Promise.reject(new Error("cannot load Vega")));
    const component = new VegaEmbed({
      mediaType: "application/vnd.vegalite.v6+json",
      spec: { mark: "bar" },
      fallback: "chart fallback",
    });
    await Promise.resolve();
    await Promise.resolve();
    etch.updateSync(component);

    expect(component.element.textContent).toContain("cannot load Vega");
    expect(component.element.textContent).toContain("chart fallback");
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
