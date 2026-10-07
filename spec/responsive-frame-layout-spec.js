const path = require("path");

describe("responsive HTML frames", () => {
  let etch, OutputStore, OutputLayout, ResultViewComponent, History, ScrollList;
  let stylesheet, hosts, components, layouts, stores;

  const frameHTML = (width = "100%") =>
    `<iframe src="http://127.0.0.1:8050/" width="${width}" height="650" frameborder="0"></iframe>`;

  const contentWidth = (element) => {
    const style = getComputedStyle(element);
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  };

  const width = (element) => element.getBoundingClientRect().width;

  function mount(surface, html = frameHTML(), hostWidth = 1000) {
    const store = new OutputStore();
    store.appendOutput({ output_type: "display_data", data: { "text/html": html }, metadata: {} });
    stores.push(store);

    const host = document.createElement("div");
    host.className = surface === "inline" ? "jupyter-repl marker" : "jupyter-repl";
    host.style.cssText = `width: ${hostWidth}px; height: 760px; font-size: 14px; --ui-spacing: 8px; --base-border-color: rgb(50, 50, 50);`;
    hosts.push(host);

    let component, layout, panel;
    if (surface === "inline") {
      layout = new OutputLayout(store);
      layout.updatePosition({
        editorWidth: hostWidth,
        lineLength: 40,
        charWidth: 8,
        lineHeight: 16,
      });
      layouts.push(layout);
      component = new ResultViewComponent({ store, layout, editor: null, showResult: true });
      host.appendChild(component.element);
    } else {
      panel = document.createElement("div");
      panel.className = "sidebar output-area";
      host.appendChild(panel);
      component =
        surface === "history" ? new History({ store }) : new ScrollList({ outputs: store.outputs });
      panel.appendChild(component.element);
    }
    components.push(component);
    etch.updateSync(component);

    const frame = host.querySelector("iframe");
    // Keep the emitted HTTP src intact while avoiding a Dash server or network
    // dependency. srcdoc changes only the embedded document, not frame layout.
    if (frame) frame.srcdoc = "<!doctype html><title>Layout fixture</title>";
    jasmine.attachToDOM(host);

    return {
      host,
      panel,
      component,
      store,
      frame,
      container: host.querySelector(".multiline-container"),
      resizeHost(hostWidth) {
        host.style.width = `${hostWidth}px`;
        if (layout) {
          layout.updatePosition({ editorWidth: hostWidth });
          etch.updateSync(component);
        }
      },
    };
  }

  beforeEach(() => {
    etch = require("@lumine-code/etch");
    OutputStore = require("../lib/store/output");
    OutputLayout = require("../lib/components/result-view/output-layout");
    ResultViewComponent = require("../lib/components/result-view/result-view");
    History = require("../lib/components/result-view/history");
    ScrollList = require("../lib/components/result-view/list");
    stylesheet = lumine.themes.requireStylesheet(path.join(__dirname, "..", "styles", "main.css"));
    hosts = [];
    components = [];
    layouts = [];
    stores = [];
  });

  afterEach(() => {
    for (const component of components) component.destroy();
    for (const layout of layouts) layout.destroy();
    for (const store of stores) store.emitter.dispose();
    for (const host of hosts) host.remove();
    stylesheet.dispose();
  });

  for (const surface of ["inline", "history", "list"]) {
    it(`fills the available ${surface} width and follows wide and narrow hosts`, () => {
      const mounted = mount(surface);
      const { component, container, frame, host, panel } = mounted;
      const browsingContext = frame.contentWindow;

      expect(frame.getAttribute("src")).toBe("http://127.0.0.1:8050/");
      expect(frame.getAttribute("width")).toBe("100%");
      expect(frame.getAttribute("height")).toBe("650");
      expect(frame.getAttribute("frameborder")).toBe("0");

      for (const hostWidth of [1000, 700, 240]) {
        mounted.resizeHost(hostWidth);
        const display = surface === "inline" ? component.refs.display : container;
        const available = surface === "inline" ? hostWidth - 16 : contentWidth(panel);

        expect(width(container))
          .withContext(`${surface} box at ${hostWidth}px`)
          .toBeCloseTo(available, 0);
        expect(width(frame))
          .withContext(`${surface} frame at ${hostWidth}px`)
          .toBeCloseTo(contentWidth(display), 0);
        expect(width(frame)).toBeGreaterThan(0);
        expect(width(frame)).toBeLessThan(hostWidth);
        expect(host.querySelector("iframe")).toBe(frame);
        expect(frame.contentWindow).toBe(browsingContext);
      }
    });
  }

  it("keeps an inline frame inside a dragged width and restores responsive sizing on reset", () => {
    const mounted = mount("inline");
    const { component, container, frame } = mounted;
    const display = component.refs.display;
    const startWidth = display.offsetWidth;
    component.element
      .querySelector(".result-resize")
      .dispatchEvent(
        new MouseEvent("mousedown", { button: 0, bubbles: true, clientX: 1000, clientY: 320 }),
      );
    window.dispatchEvent(
      new MouseEvent("mousemove", {
        buttons: 1,
        clientX: 1000 + 420 - startWidth,
        clientY: 320,
      }),
    );
    window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

    expect(component.resizedWidth).toBe(420);
    expect(width(container)).toBeCloseTo(422, 0);
    expect(width(frame)).toBeCloseTo(contentWidth(display), 0);
    mounted.resizeHost(700);
    expect(width(container)).toBeCloseTo(422, 0);
    expect(width(frame)).toBeCloseTo(contentWidth(display), 0);

    component.resetSize();
    etch.updateSync(component);
    expect(component.resizedWidth).toBeNull();
    expect(width(container)).toBeCloseTo(684, 0);
    expect(width(frame)).toBeCloseTo(contentWidth(display), 0);
    expect(mounted.host.querySelector("iframe")).toBe(frame);
  });

  for (const surface of ["inline", "history", "list"]) {
    it(`keeps percentage widths relative to the whole available ${surface} area`, () => {
      const mounted = mount(surface, frameHTML("50%"));
      for (const hostWidth of [1000, 700, 240]) {
        mounted.resizeHost(hostWidth);
        const display = surface === "inline" ? mounted.component.refs.display : mounted.container;
        const available = surface === "inline" ? hostWidth - 16 : contentWidth(mounted.panel);
        expect(width(mounted.container)).toBeCloseTo(available, 0);
        expect(width(mounted.frame)).toBeCloseTo(contentWidth(display) / 2, 0);
        expect(mounted.frame.getAttribute("width")).toBe("50%");
      }
    });

    it(`preserves an explicit numeric iframe width in ${surface}`, () => {
      const mounted = mount(surface, frameHTML("240"));
      expect(width(mounted.frame)).toBe(240);
      mounted.resizeHost(700);
      expect(width(mounted.frame)).toBe(240);
      expect(mounted.frame.getAttribute("width")).toBe("240");
    });
  }

  it("keeps ordinary short HTML output at its natural inline width", () => {
    const mounted = mount("inline", "<span>short</span>");
    expect(width(mounted.container)).toBeGreaterThan(0);
    expect(width(mounted.container)).toBeLessThan(200);
    const naturalWidth = width(mounted.container);
    mounted.resizeHost(700);
    expect(width(mounted.container)).toBeCloseTo(naturalWidth, 0);
  });

  for (const surface of ["inline", "list"]) {
    it(`keeps a responsive ${surface} frame within its host beside unwrapped stream output`, () => {
      const getConfig = lumine.config.get.bind(lumine.config);
      spyOn(lumine.config, "get").and.callFake((keyPath, ...args) =>
        keyPath === "jupyter-repl.wrapOutput" ? false : getConfig(keyPath, ...args),
      );
      const mounted = mount(surface);
      mounted.store.appendOutput({
        output_type: "stream",
        name: "stdout",
        text: "x".repeat(10000),
      });
      if (surface === "list") mounted.component.update({ outputs: mounted.store.outputs });
      etch.updateSync(mounted.component);
      const stream = mounted.host.querySelector("pre.output-stream");
      expect(stream.textContent.length).toBe(10000);
      // The package's unconditional pre-wrap typography overrides its wrap
      // setting. Isolate this width regression with a genuinely unwrapped line.
      stream.style.whiteSpace = "pre";
      stream.style.overflowWrap = "normal";
      expect(getComputedStyle(stream).whiteSpace).toBe("pre");
      // Core's normalize.css lets pre own its scrollbar; the outer result
      // should still size its frame from the host rather than this long line.
      expect(getComputedStyle(stream).overflowX).toBe("auto");

      for (const hostWidth of [1000, 240]) {
        mounted.resizeHost(hostWidth);
        const display = surface === "inline" ? mounted.component.refs.display : mounted.container;
        expect(width(mounted.frame)).toBeCloseTo(contentWidth(display), 0);
        expect(width(mounted.frame)).toBeLessThan(hostWidth);
        expect(stream.scrollWidth).toBeGreaterThan(stream.clientWidth);
        expect(mounted.host.querySelector("iframe")).toBe(mounted.frame);
      }
    });
  }

  it("releases responsive inline sizing when output is replaced with fixed or ordinary HTML", () => {
    const mounted = mount("inline");
    const replace = (html) => {
      mounted.store.appendOutput({ output_type: "clear_output", wait: true });
      mounted.store.appendOutput({
        output_type: "display_data",
        data: { "text/html": html },
        metadata: {},
      });
      etch.updateSync(mounted.component);
    };
    expect(width(mounted.container)).toBeCloseTo(984, 0);

    replace(frameHTML("240"));
    expect(width(mounted.host.querySelector("iframe"))).toBe(240);
    expect(width(mounted.container)).toBeLessThan(400);

    replace("<span>short</span>");
    expect(mounted.host.querySelector("iframe")).toBeNull();
    expect(width(mounted.container)).toBeLessThan(200);

    replace(frameHTML());
    expect(width(mounted.container)).toBeCloseTo(984, 0);
    expect(width(mounted.host.querySelector("iframe"))).toBeCloseTo(
      contentWidth(mounted.component.refs.display),
      0,
    );
  });

  it("accepts whitespace around a percentage width", () => {
    const mounted = mount("inline", frameHTML(" 100% "));
    expect(width(mounted.container)).toBeCloseTo(984, 0);
    expect(width(mounted.frame)).toBeCloseTo(contentWidth(mounted.component.refs.display), 0);
  });

  it("responds to live width attributes without replacing or navigating the frame", () => {
    const mounted = mount("inline");
    const { component, container, frame, host } = mounted;
    const browsingContext = frame.contentWindow;
    frame.setAttribute("width", "240");
    expect(width(frame)).toBe(240);
    expect(width(container)).toBeLessThan(400);

    frame.setAttribute("width", "100%");
    expect(width(container)).toBeCloseTo(984, 0);
    expect(width(frame)).toBeCloseTo(contentWidth(component.refs.display), 0);
    expect(host.querySelector("iframe")).toBe(frame);
    expect(frame.contentWindow).toBe(browsingContext);
    expect(frame.getAttribute("src")).toBe("http://127.0.0.1:8050/");
    expect(frame.srcdoc).toBe("<!doctype html><title>Layout fixture</title>");
  });
});
