const fs = require("fs");
const path = require("path");
const { Range } = require("lumine");

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(condition, description) {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 5000) throw new Error(`Timed out waiting for ${description}`);
    await delay(10);
  }
}

describe("traceback navigation through the published hyperclick provider", () => {
  let jupyterPackage;
  let hyperclickPackage;
  let hyperclick;
  let Traceback;
  let etch;
  let root;
  let views;
  let elements;
  let dockItems;
  let editors;
  let decorations;
  let markers;
  let services;
  let previousDelay;

  beforeEach(async () => {
    jasmine.useRealClock();
    previousDelay = lumine.config.get("hyperclick.hoverDelay");
    const sibling = path.resolve(__dirname, "..", "..", "hyperclick");
    hyperclickPackage = lumine.packages.loadPackage(
      fs.existsSync(path.join(sibling, "package.json")) ? sibling : "hyperclick",
    );
    await lumine.packages.activatePackage(hyperclickPackage.name);
    lumine.config.set("hyperclick.hoverDelay", 30);
    jupyterPackage = lumine.packages.loadPackage(path.resolve(__dirname, ".."));
    await lumine.packages.activatePackage(jupyterPackage.name);
    hyperclick = hyperclickPackage.mainModule;
    Traceback = require("../lib/components/result-view/traceback");
    etch = require("@lumine-code/etch");
    root = lumine.views.getView(lumine.workspace);
    if (!root.isConnected) jasmine.attachToDOM(root);
    views = [];
    elements = [];
    dockItems = [];
    editors = [];
    decorations = [];
    markers = [];
    services = [];
    const published = jupyterPackage.mainModule.provideHyperclick();
    expect(hyperclick.registry.registrations.some((entry) => entry.provider === published)).toBe(
      true,
    );
  });

  afterEach(async () => {
    for (const service of services || []) service.dispose();
    for (const view of views || []) view.destroy();
    for (const decoration of decorations || []) decoration.destroy();
    for (const marker of markers || []) marker.destroy();
    for (const item of dockItems || []) await lumine.workspace.paneForItem(item)?.destroyItem(item);
    for (const element of elements || []) element.remove();
    for (const editor of editors || []) editor.destroy();
    for (const pkg of [jupyterPackage, hyperclickPackage]) {
      if (pkg && lumine.packages.isPackageActive(pkg.name))
        await lumine.packages.deactivatePackage(pkg.name);
      if (pkg && lumine.packages.isPackageLoaded(pkg.name))
        await lumine.packages.unloadPackage(pkg.name);
    }
    if (previousDelay === undefined) lumine.config.unset("hyperclick.hoverDelay");
    else lumine.config.set("hyperclick.hoverDelay", previousDelay);
    jupyterPackage = hyperclickPackage = null;
  });

  function mouse(type, target, altKey = false) {
    const bounds = target.getBoundingClientRect();
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      button: 0,
      altKey,
      clientX: bounds.left + 1,
      clientY: bounds.top + 1,
    });
    target.dispatchEvent(event);
    return event;
  }

  function releaseAlt() {
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", altKey: false, bubbles: true }));
  }

  async function dock(props) {
    const view = new Traceback(props);
    views.push(view);
    const element = document.createElement("div");
    element.className = "jupyter-repl traceback-dock-fixture";
    element.appendChild(view.element);
    const item = {
      element,
      getTitle: () => "Traceback fixture",
      getURI: () => "lumine://jupyter-traceback-hyperclick-fixture",
      getDefaultLocation: () => "right",
      getAllowedLocations: () => ["right"],
      destroy: () => element.remove(),
    };
    dockItems.push(item);
    elements.push(element);
    await lumine.workspace.open(item, { location: "right", activatePane: false });
    await waitFor(() => view.element.isConnected, "dock traceback attachment");
    return view;
  }

  async function inline(props) {
    const editor = await lumine.workspace.open();
    editors.push(editor);
    editor.setText("alpha\n");
    const editorElement = lumine.views.getView(editor);
    editorElement.style.width = "600px";
    editorElement.style.height = "200px";
    const view = new Traceback(props);
    views.push(view);
    const element = document.createElement("div");
    element.className = "jupyter-repl marker traceback-inline-fixture";
    element.appendChild(view.element);
    elements.push(element);
    const marker = editor.markBufferPosition([0, 5], { invalidate: "never" });
    markers.push(marker);
    decorations.push(
      editor.decorateMarker(marker, { type: "block", item: element, position: "after" }),
    );
    editorElement.component?.updateSync();
    await waitFor(() => view.element.isConnected, "inline traceback block decoration");
    return { editor, view };
  }

  for (const surface of ["dock", "inline"]) {
    it(`uses Alt hover delay and Alt mousedown for a real local file traceback in the ${surface}`, async () => {
      const props = {
        output: {
          output_type: "error",
          ename: "RuntimeError",
          traceback: [`  File "${__filename}", line 4, in fixture`, "RuntimeError: failed"],
        },
      };
      const view = surface === "dock" ? await dock(props) : (await inline(props)).view;
      const span = view.element.querySelector(".traceback-location");
      const open = spyOn(lumine.workspace, "open").and.returnValue(Promise.resolve({}));
      mouse("mousemove", span);
      const plainDown = mouse("mousedown", span);
      const plainClick = mouse("click", span);
      await delay(40);
      expect(open).not.toHaveBeenCalled();
      expect(span.classList.contains("hyperclick-dom-link")).toBe(false);
      expect(getComputedStyle(span).cursor).not.toBe("pointer");
      expect(plainDown.defaultPrevented).toBe(false);
      expect(plainClick.defaultPrevented).toBe(false);

      mouse("mousemove", span, true);
      expect(span.classList.contains("hyperclick-dom-link")).toBe(false);
      expect(hyperclick.elementController.hoverTimer).not.toBe(null);
      await waitFor(() => span.classList.contains("hyperclick-dom-link"), "Alt hover affordance");
      expect(getComputedStyle(span).cursor).toBe("pointer");
      releaseAlt();
      expect(span.classList.contains("hyperclick-dom-link")).toBe(false);
      expect(getComputedStyle(span).cursor).not.toBe("pointer");

      mouse("mousemove", span, true);
      await waitFor(
        () => span.classList.contains("hyperclick-dom-link"),
        "second Alt hover affordance",
      );
      const down = mouse("mousedown", span, true);
      await waitFor(() => open.calls.count() === 1, "traceback source navigation");
      const click = mouse("click", span, true);
      await delay(20);
      expect(down.defaultPrevented).toBe(true);
      expect(click.defaultPrevented).toBe(true);
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(__filename, { initialLine: 3, initialColumn: 0 });
    });
  }

  it("drops the active affordance when identical text reuses a traceback span for a new destination", async () => {
    const first = jasmine.createSpy("first source");
    const second = jasmine.createSpy("second source");
    const output = { traceback: ["Cell In[3], line 1", "RuntimeError: failed"] };
    const view = await dock({ output, resolveTracebackFrame: () => ({ open: first }) });
    const span = view.element.querySelector(".traceback-location");
    mouse("mousemove", span, true);
    await waitFor(() => span.classList.contains("hyperclick-dom-link"), "old target affordance");
    const revision = span.getAttribute("data-hyperclick-revision");
    view.update({ output: { ...output }, resolveTracebackFrame: () => ({ open: second }) });
    etch.updateSync(view);
    await waitFor(
      () => !span.classList.contains("hyperclick-dom-link"),
      "obsolete target revocation",
    );
    expect(view.element.querySelector(".traceback-location")).toBe(span);
    expect(span.getAttribute("data-hyperclick-revision")).not.toBe(revision);
    mouse("mousedown", span, true);
    await waitFor(() => second.calls.count() === 1, "current target navigation");
    mouse("click", span, true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("keeps an unresolved inline traceback from activating source-word providers behind the output", async () => {
    const { editor, view } = await inline({
      output: { traceback: ["Cell In[99], line 1", "RuntimeError: unresolved"] },
    });
    expect(view.element.querySelector(".traceback-location")).toBe(null);
    expect(view.element.hasAttribute("data-hyperclick-boundary")).toBe(true);
    const wordOpen = jasmine.createSpy("underlying word navigation");
    const wordLookup = jasmine
      .createSpy("underlying word lookup")
      .and.callFake((_editor, _text, range) => ({ range, callback: wordOpen }));
    services.push(
      lumine.packages.serviceHub.provide("hyperclick.provider", "1.0.0", {
        priority: 100,
        providerName: "source-word fixture",
        getSuggestionForWord: wordLookup,
      }),
    );
    const controller = hyperclick.editors.get(editor);
    const wordRange = spyOn(controller, "wordRangeForEvent").and.returnValue(
      new Range([0, 0], [0, 5]),
    );
    spyOn(document, "elementFromPoint").and.returnValue(view.element);
    mouse("mousemove", view.element, true);
    mouse("mousedown", view.element, true);
    mouse("click", view.element, true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
    await delay(50);
    expect(wordRange).not.toHaveBeenCalled();
    expect(wordLookup).not.toHaveBeenCalled();
    expect(wordOpen).not.toHaveBeenCalled();
    expect(controller.pointerPosition).toBe(null);
    expect(view.element.querySelector(".hyperclick-dom-link")).toBe(null);
  });
});
