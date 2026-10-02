const etch = require("@lumine-code/etch");
const {
  PlotlyTransform,
  plotlyHtmlRenderer,
  runtime,
} = require("../lib/components/result-view/plotly");

function figure(value = 1) {
  return { data: [{ x: [value], y: [2] }], layout: { title: "A plot" } };
}

describe("Plotly output lifecycle", () => {
  let component;
  let plotly;

  beforeEach(() => {
    plotly = {
      Icons: { camera: {} },
      newPlot: jasmine.createSpy("newPlot").and.returnValue(Promise.resolve()),
      react: jasmine.createSpy("react").and.returnValue(Promise.resolve()),
      purge: jasmine.createSpy("purge"),
      toImage: jasmine
        .createSpy("toImage")
        .and.returnValue(Promise.resolve("data:image/png;base64,AA")),
    };
    spyOn(runtime, "load").and.returnValue(plotly);
  });

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  it("contains malformed figure JSON and renders the plain-text fallback", async () => {
    component = new PlotlyTransform({ data: "{invalid", fallback: "figure fallback" });
    await component.plotPromise;

    expect(component.element.querySelector(".output-plotly-error")).toBeTruthy();
    expect(component.element.textContent).toContain("figure fallback");
    expect(runtime.load).not.toHaveBeenCalled();
  });

  it("contains a rejected plot initialization without replacing its root", async () => {
    plotly.newPlot.and.returnValue(Promise.reject(new Error("GPU unavailable")));
    component = new PlotlyTransform({ data: figure(), fallback: "chart fallback" });
    const root = component.element;
    await component.plotPromise;
    etch.updateSync(component);

    expect(component.element).toBe(root);
    expect(component.element.textContent).toContain("GPU unavailable");
    expect(component.element.textContent).toContain("chart fallback");
  });

  it("protects kernel-owned traces from Plotly's mutations", async () => {
    const original = figure();
    plotly.newPlot.and.callFake((_element, data) => {
      data[0].uid = "plotly-added";
      data[0].x.push(99);
      return Promise.resolve();
    });
    component = new PlotlyTransform({ data: original });
    await component.plotPromise;

    expect(original).toEqual(figure());
  });

  it("does not replot an unchanged figure during a parent redraw", async () => {
    const data = figure();
    component = new PlotlyTransform({ data });
    await component.plotPromise;
    await component.update({ data });

    expect(plotly.newPlot).toHaveBeenCalledTimes(1);
    expect(plotly.react).not.toHaveBeenCalled();
  });

  it("keeps parsed HTML figures stable across repeated parent redraws", () => {
    const html = '<script>Plotly.newPlot("chart", [{"x":[1]}], {"title":"safe"});</script>';
    const bundle = { "text/vnd.plotly.v1+html": html };
    const first = plotlyHtmlRenderer(html, {}, bundle);
    const repeated = plotlyHtmlRenderer(html, {}, bundle);

    expect(repeated.props.data).toBe(first.props.data);
  });

  it("renders and updates a figure through the installed Plotly runtime", async () => {
    runtime.load.and.callThrough();
    component = new PlotlyTransform({ data: figure(1) });
    jasmine.attachToDOM(component.element);
    await component.plotPromise;
    expect(component.plotError).toBeNull();
    expect(component.refs.plot.querySelector("svg.main-svg")).toBeTruthy();

    await component.update({ data: figure(3) });
    expect(component.plotError).toBeNull();
    expect(component.refs.plot.data[0].x).toEqual([3]);
  }, 15000);

  it("waits for initialization before applying the next figure", async () => {
    let finishFirst;
    plotly.newPlot.and.returnValue(new Promise((resolve) => (finishFirst = resolve)));
    component = new PlotlyTransform({ data: figure(1) });
    const first = component.plotPromise;
    await Promise.resolve();
    const next = component.update({ data: figure(3) });
    await Promise.resolve();

    expect(plotly.newPlot).toHaveBeenCalledTimes(1);
    expect(plotly.react).not.toHaveBeenCalled();
    finishFirst();
    await first;
    await next;

    expect(plotly.react).toHaveBeenCalledTimes(1);
    const [_element, data, layout, options] = plotly.react.calls.mostRecent().args;
    expect(data[0].x).toEqual([3]);
    expect(layout.paper_bgcolor).toBe("rgba(0,0,0,0)");
    expect(options.modeBarButtonsToRemove).toEqual(["toImage"]);
  });

  it("purges resources created after the view was destroyed", async () => {
    let finishPlot;
    plotly.newPlot.and.returnValue(new Promise((resolve) => (finishPlot = resolve)));
    component = new PlotlyTransform({ data: figure() });
    await Promise.resolve();
    const anchor = component.refs.plot;
    component.destroy();
    expect(plotly.purge).toHaveBeenCalledWith(anchor);
    finishPlot();
    await component.plotPromise;

    expect(plotly.purge).toHaveBeenCalledTimes(2);
    component = null;
  });

  it("contains image export failures and explains them to the user", async () => {
    const notification = spyOn(lumine.notifications, "addError");
    component = new PlotlyTransform({ data: figure() });
    await component.plotPromise;
    plotly.toImage.and.returnValue(Promise.reject(new Error("cannot export canvas")));
    await component.downloadImage(component.refs.plot);

    expect(notification).toHaveBeenCalledWith("Failed to download plot", {
      detail: "cannot export canvas",
    });
  });
});
