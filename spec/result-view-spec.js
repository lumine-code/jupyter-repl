const etch = require("@lumine-code/etch");
const OutputStore = require("../lib/store/output");
const ResultViewComponent = require("../lib/components/result-view/result-view");
const actions = require("../lib/components/result-view/output-actions");

// The result bubble had no spec of its own. Everything that reached it went
// through `createResultBatch`, which only ever produced status messages, so the
// branch that actually renders output — the outputs, the toolbar, the expand
// button — was never rendered once.
//
// `readAfterUpdate` is deferred to an animation frame that the spec runner's
// frozen clock never delivers, so `afterRender` is called directly here; the
// constructor calls it the same way.

function blockStore() {
  // Left at the default zero metrics, which is what a result renders as before
  // anything measures it: `isPlain` is false, so the block branch renders.
  return new OutputStore();
}

function inlineStore() {
  const store = new OutputStore();
  store.updatePosition({ editorWidth: 800, lineLength: 0, charWidth: 8, lineHeight: 16 });
  return store;
}

function stream(text) {
  return { output_type: "stream", name: "stdout", text };
}

function build(store) {
  return new ResultViewComponent({
    store,
    editor: null,
    destroy: () => {},
    showResult: true,
  });
}

describe("the result bubble", () => {
  let component;

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  it("renders a status while it has no output", () => {
    const store = blockStore();
    component = build(store);

    expect(component.element.querySelector(".jupyter_cell_display")).toBeNull();
  });

  it("renders one element per output once output arrives", () => {
    const store = blockStore();
    store.appendOutput(stream("first\nsecond\n"));
    store.appendOutput({ output_type: "display_data", data: { "text/plain": "42" }, metadata: {} });
    component = build(store);
    etch.updateSync(component);

    const display = component.element.querySelector(".jupyter_cell_display");
    expect(display).not.toBeNull();
    expect(display.children.length).toBe(2);
    expect(component.element.textContent).toContain("second");
    expect(component.element.textContent).toContain("42");
  });

  it("gives a block result a toolbar and an inline result none", () => {
    const store = blockStore();
    store.appendOutput(stream("a long enough line to stay a block\n"));
    component = build(store);
    etch.updateSync(component);

    expect(component.element.querySelector(".toolbar")).not.toBeNull();
    expect(component.element.className).toContain("multiline-container");

    component.destroy();

    const inline = inlineStore();
    inline.appendOutput(stream("42"));
    component = build(inline);
    etch.updateSync(component);

    expect(inline.isPlain).toBe(true);
    expect(component.element.querySelector(".toolbar")).toBeNull();
    expect(component.element.className).toContain("inline-container");
  });

  it("searches the rendered output for an image only when the outputs change", () => {
    const store = blockStore();
    store.appendOutput(stream("one\n"));
    component = build(store);
    etch.updateSync(component);
    component.afterRender();

    spyOn(actions, "getImage").and.callThrough();

    // A further stream chunk merges into the output already there, so there is
    // nowhere new for an image to have appeared.
    store.appendOutput(stream("two\n"));
    etch.updateSync(component);
    component.afterRender();
    expect(actions.getImage.calls.count()).toBe(0);

    // A new output can carry one, so this one is worth walking the tree for.
    store.appendOutput({
      output_type: "display_data",
      data: { "image/png": "AAAA" },
      metadata: {},
    });
    etch.updateSync(component);
    component.afterRender();
    expect(actions.getImage.calls.count()).toBe(1);
    expect(component.hasImage).toBe(true);
  });

  it("scrolls to the bottom of a block result", () => {
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    component = build(store);
    etch.updateSync(component);

    const display = component.refs.display;
    // jsdom-less headless layout still reports zero heights for a detached
    // subtree, so assert the write happened rather than a particular offset.
    display.scrollTop = 5;
    component.afterRender();

    expect(display.scrollTop).toBe(0);
  });
});

describe("the copy action", () => {
  // A kernel that renders a result as LaTeX still sends text/plain alongside
  // in the same bundle. The button must be offered for it, and the copy must
  // produce that text even though the rendered SVG has none to select.
  const latexOutput = {
    output_type: "execute_result",
    data: { "text/plain": "24.775 deg", "text/latex": "$24.775\\,\\mathrm{deg}$" },
    metadata: {},
  };

  it("offers the copy button for a LaTeX-rendered bundle", () => {
    expect(actions.hasCopyableContent([latexOutput])).toBe(true);

    const store = blockStore();
    store.appendOutput(latexOutput);
    const component = build(store);
    etch.updateSync(component);

    expect(component.element.querySelector(".icon-clippy")).not.toBeNull();
    component.destroy();
  });

  it("copies the bundle's own text when the rendered DOM has none", async () => {
    spyOn(lumine.clipboard, "write");
    const element = document.createElement("div"); // SVG paths: no innerText

    await actions.copyToClipboard(element, [latexOutput]);

    expect(lumine.clipboard.write).toHaveBeenCalledWith("24.775 deg");
  });

  it("prefers the rendered DOM text when there is some", async () => {
    spyOn(lumine.clipboard, "write");
    const element = document.createElement("div");
    element.textContent = "rendered text";
    // Detached elements report empty innerText; textContent is the fallback
    // the browser uses there, so patch innerText to behave as when attached.
    Object.defineProperty(element, "innerText", { get: () => element.textContent });

    await actions.copyToClipboard(element, [latexOutput]);

    expect(lumine.clipboard.write).toHaveBeenCalledWith("rendered text");
  });
});
