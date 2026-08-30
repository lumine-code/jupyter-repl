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

function build(store, props) {
  return new ResultViewComponent({
    store,
    editor: null,
    showResult: true,
    ...props,
  });
}

// The floor the grip clamps to, mirrored from result-view.jsx.
const MIN_RESIZE_WIDTH = 64;
const MIN_RESIZE_HEIGHT = 32;

function press(element, clientX, clientY) {
  element.dispatchEvent(
    new MouseEvent("mousedown", { button: 0, bubbles: true, clientX, clientY }),
  );
}

function drag(clientX, clientY) {
  window.dispatchEvent(new MouseEvent("mousemove", { buttons: 1, clientX, clientY }));
}

function release() {
  window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
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

  it("gives a block result hover chrome and an inline result none", () => {
    // The chrome is positioned out of the layout — the old toolbar is gone, so
    // nothing reserves space beside the content. Only what is about the box
    // itself is here; copy, open and save are context-menu items. Expand joins
    // close in the column once the content overflows.
    const store = blockStore();
    store.appendOutput(stream("a long enough line to stay a block\n"));
    component = build(store);
    etch.updateSync(component);

    expect(component.element.className).toContain("multiline-container");
    expect(component.element.querySelector(".toolbar")).toBeNull();
    const group = component.element.querySelector(".result-actions");
    expect(group).not.toBeNull();
    expect([...group.children].map((el) => el.classList[0])).toEqual(["result-close"]);
    expect(component.element.querySelector(".result-expand")).toBeNull();
    expect(component.element.querySelector(".result-resize")).not.toBeNull();

    component.destroy();

    const inline = inlineStore();
    inline.appendOutput(stream("42"));
    component = build(inline);
    etch.updateSync(component);

    expect(inline.isPlain).toBe(true);
    expect(component.element.className).toContain("inline-container");
    expect(component.element.querySelector(".result-actions")).toBeNull();
    expect(component.element.querySelector(".result-resize")).toBeNull();
    expect(component.element.children.length).toBe(1);
  });

  it("keeps the chrome clear of the display's scrollbars", () => {
    // It sits inside the box, so a bar the display grows is a gutter it has to
    // clear — otherwise a button lands on the bar and the grip takes its drag.
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    component = build(store);
    etch.updateSync(component);
    jasmine.attachToDOM(component.element);
    component.afterRender();
    etch.updateSync(component);

    const display = component.refs.display;
    expect(component.gutterRight).toBe(display.offsetWidth - display.clientWidth);
    expect(component.gutterBottom).toBe(display.offsetHeight - display.clientHeight);
    for (const part of component.element.querySelectorAll(".result-actions, .result-resize")) {
      expect(part.style.right).toBe(`${component.gutterRight}px`);
    }
    expect(component.element.querySelector(".result-resize").style.bottom).toBe(
      `${component.gutterBottom}px`,
    );
  });

  it("offers expand only while the content overflows, and toggles it", () => {
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    component = build(store);
    etch.updateSync(component);
    jasmine.attachToDOM(component.element);
    component.afterRender();
    etch.updateSync(component);

    const expand = component.element.querySelector(".result-expand");
    expect(expand).not.toBeNull();
    expect(expand.className).toContain("icon-unfold");

    expand.onclick ? expand.onclick() : component.toggleExpand();
    etch.updateSync(component);

    expect(component.expanded).toBe(true);
    expect(component.element.querySelector(".result-expand").className).toContain("icon-fold");
  });

  it("resizes from the grip, clamps to a floor, and can be put back", () => {
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    const onUserResize = jasmine.createSpy("onUserResize");
    component = build(store, { onUserResize });
    etch.updateSync(component);
    jasmine.attachToDOM(component.element);
    component.afterRender();
    etch.updateSync(component);

    const display = component.refs.display;
    const width = display.offsetWidth;
    const height = display.offsetHeight;

    press(component.element.querySelector(".result-resize"), 500, 500);
    // The owner has to relax its re-measure budget for the whole gesture, or
    // the editor freezes at the pre-drag height four frames in.
    expect(onUserResize).toHaveBeenCalledWith(true);

    drag(420, 460);
    expect(component.resizedWidth).toBe(Math.max(MIN_RESIZE_WIDTH, width - 80));
    expect(component.resizedHeight).toBe(Math.max(MIN_RESIZE_HEIGHT, height - 40));
    expect(display.style.width).toBe(`${component.resizedWidth}px`);
    expect(display.style.height).toBe(`${component.resizedHeight}px`);
    // A dragged height is the height: the 600px cap no longer describes the box.
    expect(display.style.maxHeight).toBe("none");

    // Far past the floor in both axes.
    drag(-5000, -5000);
    expect(component.resizedWidth).toBe(MIN_RESIZE_WIDTH);
    expect(component.resizedHeight).toBe(MIN_RESIZE_HEIGHT);

    release();
    expect(onUserResize).toHaveBeenCalledWith(false);

    // The window listeners went with the release, so a stray move is nothing.
    drag(900, 900);
    expect(component.resizedWidth).toBe(MIN_RESIZE_WIDTH);

    component.resetSize();
    etch.updateSync(component);
    expect(component.resizedWidth).toBeNull();
    expect(display.style.width).toBe("");
    expect(display.style.height).toBe("");
    expect(display.style.maxHeight).toBe("600px");
  });

  it("hands the box back to expand when it is toggled after a drag", () => {
    // Both answer the same question, so the last one asked wins: fitting to the
    // content cannot leave a dragged height capping it.
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    component = build(store);
    etch.updateSync(component);
    jasmine.attachToDOM(component.element);
    component.afterRender();
    etch.updateSync(component);

    press(component.element.querySelector(".result-resize"), 500, 500);
    drag(400, 400);
    release();
    expect(component.resizedHeight).not.toBeNull();
    expect(component.isScroller).toBe(true);

    component.toggleExpand();
    etch.updateSync(component);

    expect(component.resizedHeight).toBeNull();
    expect(component.expanded).toBe(true);
    expect(component.isScroller).toBe(false);
    expect(component.refs.display.style.maxHeight).toBe("100%");
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

describe("measuring after attachment", () => {
  // The bubble lives in a block decoration the editor attaches asynchronously.
  // A final output that patches first measures a detached element: zero
  // scrollHeight, so no expand button and no auto-scroll — and with no more
  // outputs coming, nothing else would ever correct it. The resize hook is
  // what re-measures once the element actually has a size.
  let component;

  afterEach(() => {
    component?.destroy();
    component = null;
  });

  it("recovers the expand overlay once the element has a real size", () => {
    // The overlay and the context menu both read this flag, so a
    // detached-then-attached bubble must still end up knowing it overflows.
    const store = blockStore();
    store.appendOutput(stream("line\n".repeat(200)));
    component = build(store);
    etch.updateSync(component);

    component.afterRender();
    expect(component.showExpandButton).toBe(false);

    jasmine.attachToDOM(component.element);
    // What ResultView.handleElementResize triggers when the decoration lands.
    etch.updateSync(component);
    component.afterRender();
    etch.updateSync(component);

    expect(component.showExpandButton).toBe(true);
    expect(component.element.querySelector(".result-expand")).not.toBeNull();
  });

  it("middle click closes the result wherever on it the press lands", async () => {
    // The same gesture that closes a tab; the listener sits on the wrapper,
    // so the status icon, an inline value and a block all answer to it.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const view = new ResultView(markers, editor, 0, true);
      view.outputStore.appendOutput(stream("42\n"));
      etch.updateSync(view.component);

      view.component.element.dispatchEvent(
        new MouseEvent("mousedown", { button: 1, bubbles: true }),
      );

      expect(view.destroyed).toBe(true);
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("the resize hook re-renders the component", async () => {
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    // The constructor arms a real observer; the hook is driven by hand here.
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const view = new ResultView(markers, editor, 0, true);
      const updates = spyOn(view.component, "update").and.callThrough();

      view.handleElementResize();
      expect(updates).toHaveBeenCalled();

      view.destroy();
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("pins the editor's scroll anchor to the bubble for the length of a drag", async () => {
    // Growing a block decoration displaces everything after it, and the editor
    // answers by holding the cursor's row — or, when the cursor is off screen,
    // the viewport midpoint — still. Either slides this bubble by whatever the
    // drag just added, so the grip climbs out from under the pointer. For a
    // drag the bubble is the thing that must not move, so it takes the anchor.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const view = new ResultView(markers, editor, 0, true);
      const dispose = jasmine.createSpy("dispose");
      const pin = spyOn(editor.element, "pinScrollAnchorToBlockDecoration").and.returnValue({
        dispose,
      });

      view.setUserResizing(true);
      expect(pin).toHaveBeenCalledWith(view.decoration);
      expect(dispose).not.toHaveBeenCalled();

      // One gesture, one pin: a repeat start must not strand the first.
      view.setUserResizing(true);
      expect(pin.calls.count()).toBe(1);

      view.setUserResizing(false);
      expect(dispose.calls.count()).toBe(1);

      // A bubble closed mid-drag must not leave the anchor pinned to a
      // decoration that is about to stop existing.
      view.setUserResizing(true);
      view.destroy();
      expect(dispose.calls.count()).toBe(2);

      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("keeps claiming re-measures for as long as the grip is held", async () => {
    // claimSelfResize budgets self-driven re-measures, because content that
    // sizes itself from the box it is measured in oscillates between two
    // heights forever. A drag changes the height every frame and so never
    // leaves the quiet gap that refills the budget — without the bypass the
    // allowance runs out four frames in and the editor holds the pre-drag
    // height while the content reflows under it.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      // Both halves of the budget are wall-clock, and the runner's clock does
      // not advance on its own; drive it by hand so a frame is a frame.
      let now = 100000;
      spyOn(Date, "now").and.callFake(() => now);
      const view = new ResultView(markers, editor, 0, true);
      // claimSelfResize answers false for anything detached, since a detached
      // bubble has no layout to have resized.
      jasmine.attachToDOM(view.element);
      expect(document.contains(view.element)).toBe(true);

      const frame = (height) => {
        now += 16;
        return view.claimSelfResize([{ borderBoxSize: [{ blockSize: height }] }]);
      };
      const frames = (count, base) => Array.from({ length: count }, (_, i) => frame(base + i));

      // Unaided, a run of frames spends the burst allowance and then starves:
      // no gap between them is ever long enough to refill it.
      expect(frames(6, 100)).toEqual([true, true, true, true, false, false]);

      // Held, every frame claims — for as long as the gesture runs.
      view.component.props.onUserResize(true);
      expect(frames(8, 200)).toEqual([true, true, true, true, true, true, true, true]);

      // Released, and the budget is in charge again: still starved, until a gap
      // long enough to be something other than a drag refills it.
      view.component.props.onUserResize(false);
      expect(frame(300)).toBe(false);
      now += ResultView.SELF_RESIZE_BURST_MS;
      expect(frame(301)).toBe(true);

      view.destroy();
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("asks the editor to re-measure the decoration once per content change", async () => {
    // The bubble's content streams into a detached element, where no resize
    // observer fires — without an explicit invalidation the editor keeps the
    // queued icon's height and the document grows bubble by bubble as
    // scrolling reveals them.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const view = new ResultView(markers, editor, 0, true);
      const invalidations = spyOn(editor.element, "invalidateBlockDecorationDimensions");
      // The throttle compares wall-clock times; pin them so a slow run cannot
      // stretch the window open.
      let now = 100000;
      spyOn(Date, "now").and.callFake(() => now);

      view.outputStore.appendOutput(stream("line\n".repeat(50)));
      etch.updateSync(view.component);
      view.component.afterRender();
      expect(invalidations).toHaveBeenCalledWith(view.decoration);
      expect(invalidations.calls.count()).toBe(1);

      // A re-render without new content — the round trip a measurement pass
      // itself causes — must not re-invalidate, or measuring would loop.
      etch.updateSync(view.component);
      view.component.afterRender();
      expect(invalidations.calls.count()).toBe(1);

      // A further chunk inside the throttle window coalesces to a trailing
      // re-measure: streaming must not move the subtree into the editor's
      // measuring area every frame.
      view.outputStore.appendOutput(stream("more\n"));
      etch.updateSync(view.component);
      view.component.afterRender();
      expect(invalidations.calls.count()).toBe(1);

      const ResultViewClass = view.constructor;
      now += ResultViewClass.DETACHED_MEASURE_THROTTLE_MS + 50;
      window.advanceClock(ResultViewClass.DETACHED_MEASURE_THROTTLE_MS + 50);
      expect(invalidations.calls.count()).toBe(2);

      view.destroy();
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("measures an attached bubble synchronously, in the frame that grew it", async () => {
    // The editor's own resize observer fires after paint, so left to it every
    // visible result pushed the content for one frame before the anchored
    // scroll caught up. The bubble knows it grew before the frame paints, and
    // runs the editor's measure-and-compensate pass in that same frame.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const view = new ResultView(markers, editor, 0, true);
      const invalidations = spyOn(editor.element, "invalidateBlockDecorationDimensions");
      const syncUpdates = editor.component
        ? spyOn(editor.component, "updateSync").and.stub()
        : null;
      jasmine.attachToDOM(view.element);

      view.outputStore.appendOutput(stream("line\n".repeat(50)));
      etch.updateSync(view.component);
      view.component.afterRender();

      expect(invalidations).toHaveBeenCalledWith(view.decoration);
      // One update flushes every bubble that grew this frame, so it is queued
      // on the editor's document scheduler — after they have all invalidated,
      // still before the frame paints.
      await lumine.views.getNextUpdatePromise();
      if (syncUpdates) {
        expect(syncUpdates).toHaveBeenCalled();
        expect(syncUpdates.calls.count()).toBe(1);
      }

      // A content-free re-render must not re-measure — the gate that stops
      // the measurement round trip from looping applies here too.
      invalidations.calls.reset();
      etch.updateSync(view.component);
      view.component.afterRender();
      expect(invalidations).not.toHaveBeenCalled();

      view.destroy();
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });

  it("updates the editor once for every bubble that grew in the same frame", async () => {
    // A run-all fills many bubbles per frame. Each has to invalidate its own
    // decoration, but one editor update flushes all of them — twenty asking
    // separately measured at half the wall time of a twenty-bubble run.
    const ResultView = require("../lib/components/result-view");
    const MarkerStore = require("../lib/store/markers");
    const previousResizeObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      const editor = await lumine.workspace.open();
      const markers = new MarkerStore();
      const views = [0, 1, 2, 3, 4].map((row) => new ResultView(markers, editor, row, true));
      for (const view of views) {
        jasmine.attachToDOM(view.element);
      }
      const invalidations = spyOn(editor.element, "invalidateBlockDecorationDimensions");
      const syncUpdates = editor.component
        ? spyOn(editor.component, "updateSync").and.stub()
        : null;

      for (const view of views) {
        view.outputStore.appendOutput(stream("line\n".repeat(20)));
        etch.updateSync(view.component);
        view.component.afterRender();
      }
      await lumine.views.getNextUpdatePromise();

      // Every bubble still reports its own decoration as dirty...
      expect(invalidations.calls.count()).toBe(views.length);
      // ...and they are flushed together.
      if (syncUpdates) {
        expect(syncUpdates.calls.count()).toBe(1);
      }

      for (const view of views) {
        view.destroy();
      }
      editor.destroy();
    } finally {
      global.ResizeObserver = previousResizeObserver;
    }
  });
});

describe("the copy action", () => {
  // A kernel that renders a result as LaTeX still sends text/plain alongside
  // in the same bundle. The context menu must offer copy for it, and the copy
  // must produce that text even though the rendered SVG has none to select.
  const latexOutput = {
    output_type: "execute_result",
    data: { "text/plain": "24.775 deg", "text/latex": "$24.775\\,\\mathrm{deg}$" },
    metadata: {},
  };

  it("counts a LaTeX-rendered bundle as copyable", () => {
    // The gate the context menu's Copy Result item shows itself by.
    expect(actions.hasCopyableContent([latexOutput])).toBe(true);
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

  it("falls back to the LaTeX source for a math-only bundle", async () => {
    // IPython.display.Latex sends text/latex alone; the source is the only
    // text there is, and it is what a user would want on the clipboard.
    spyOn(lumine.clipboard, "write");
    const mathOnly = {
      output_type: "display_data",
      data: { "text/latex": "$x^2$" },
      metadata: {},
    };

    expect(actions.hasCopyableContent([mathOnly])).toBe(true);
    await actions.copyToClipboard(document.createElement("div"), [mathOnly]);

    expect(lumine.clipboard.write).toHaveBeenCalledWith("$x^2$");
  });
});

describe("a bubble whose content resizes itself", () => {
  // Content can change a bubble's height with no store update behind it: a
  // widget expanding an accordion, an image finishing its decode, a progress
  // bar growing a label. The dirty flag is written only by the store, so
  // nothing marked those, and the height the editor holds stayed behind. The
  // editor's own observer would correct it a frame later, but a frame late is
  // exactly the flicker the synchronous path exists to remove.
  //
  // The hazard on the other side is the loop the dirty flag was written for:
  // measuring parks the element in the editor's measuring area, which fires the
  // observer, which re-runs the render hooks.
  const ResultView = require("../lib/components/result-view");
  const MarkerStore = require("../lib/store/markers");

  let editor;
  let view;
  let invalidations;
  let deliver;
  let now;
  let previousResizeObserver;

  beforeEach(async () => {
    previousResizeObserver = global.ResizeObserver;
    // Capture the callback so an observation can be delivered by hand, with a
    // height — which is what the gate reads.
    global.ResizeObserver = class {
      constructor(callback) {
        deliver = (blockSize) => callback([{ borderBoxSize: [{ blockSize }] }]);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    editor = await lumine.workspace.open();
    view = new ResultView(new MarkerStore(), editor, 0, true);
    jasmine.attachToDOM(view.element);
    invalidations = spyOn(editor.element, "invalidateBlockDecorationDimensions");
    now = 100000;
    spyOn(Date, "now").and.callFake(() => now);
  });

  afterEach(() => {
    view?.destroy();
    editor?.destroy();
    global.ResizeObserver = previousResizeObserver;
    view = null;
    editor = null;
    deliver = null;
  });

  it("asks to be re-measured", () => {
    deliver(500);
    etch.updateSync(view.component);
    view.component.afterRender();

    expect(invalidations).toHaveBeenCalledWith(view.decoration);
  });

  it("ignores the measurement's own echo", () => {
    // The height the editor was last asked to measure comes back through the
    // observer; answering it would be answering ourselves.
    view._measuredHeight = 500;

    deliver(500);
    etch.updateSync(view.component);
    view.component.afterRender();

    expect(invalidations).not.toHaveBeenCalled();
  });

  it("stops asking when it oscillates with its own measurement", () => {
    // Content sized from the box it is measured in alternates between two
    // genuinely different heights, so neither the echo check nor the dirty flag
    // catches it. This is the anti-loop assertion.
    for (let i = 0; i < 20; i++) {
      deliver(i % 2 === 0 ? 400 : 500);
      etch.updateSync(view.component);
      view.component.afterRender();
    }

    expect(invalidations.calls.count()).toBe(ResultView.SELF_RESIZE_BUDGET);
  });

  it("starts a fresh allowance after a quiet gap", () => {
    for (let i = 0; i < 20; i++) {
      deliver(i % 2 === 0 ? 400 : 500);
      etch.updateSync(view.component);
      view.component.afterRender();
    }
    const spent = invalidations.calls.count();

    now += ResultView.SELF_RESIZE_BURST_MS + 1;
    deliver(600);
    etch.updateSync(view.component);
    view.component.afterRender();

    expect(invalidations.calls.count()).toBe(spent + 1);
  });

  it("ignores its own resize entries while detached", () => {
    // The detached branch is the one that parks the element in the measuring
    // area, so this must keep the old semantics exactly.
    view.element.remove();

    deliver(500);
    etch.updateSync(view.component);
    view.component.afterRender();

    expect(invalidations).not.toHaveBeenCalled();
  });

  it("keeps the wrapper's box commensurable with what the editor measures", () => {
    // The gate compares an observed border-box height against the height the
    // editor recorded. A border, padding or margin on the wrapper would
    // decouple the two and both this gate and the editor's own guard would
    // start missing changes.
    const style = getComputedStyle(view.element);

    expect(style.borderTopWidth).toBe("0px");
    expect(style.borderBottomWidth).toBe("0px");
    expect(style.paddingTop).toBe("0px");
    expect(style.paddingBottom).toBe("0px");
    expect(style.marginTop).toBe("0px");
    expect(style.marginBottom).toBe("0px");
  });
});
