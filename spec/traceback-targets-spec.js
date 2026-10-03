let targets;
const path = require("path");

describe("traceback DOM target registrations", () => {
  let host;
  let span;
  let registrations;

  beforeEach(() => {
    targets = require("../lib/traceback-targets");
    host = document.createElement("div");
    host.className = "structured-traceback";
    span = document.createElement("span");
    span.className = "traceback-location";
    host.appendChild(span);
    document.body.appendChild(host);
    registrations = [];
  });
  afterEach(() => {
    for (const registration of registrations) registration.dispose();
    host.remove();
  });

  it("re-resolves the verified target on activation and honors abort and lifecycle guards", async () => {
    let current = true;
    const first = jasmine.createSpy("first");
    const second = jasmine.createSpy("second");
    let link = { open: first };
    registrations.push(targets.registerTarget(span, () => link, { isCurrent: () => current }));
    const controller = new AbortController();
    const suggestion = targets.getSuggestionForElement(span, { signal: controller.signal });
    link = { open: second };
    await suggestion.callback();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    current = false;
    await suggestion.callback();
    expect(suggestion.isCurrent()).toBe(false);
    current = true;
    controller.abort();
    await suggestion.callback();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not let a disposed old registration withdraw a replacement on the same span", async () => {
    const old = targets.registerTarget(span, () => ({ open: jasmine.createSpy("old") }));
    registrations.push(old);
    const previous = targets.getSuggestionForElement(span);
    const open = jasmine.createSpy("replacement");
    registrations.push(targets.registerTarget(span, () => ({ open })));
    const revision = span.getAttribute("data-hyperclick-revision");
    old.dispose();
    expect(span.getAttribute("data-hyperclick-revision")).toBe(revision);
    expect(previous.isCurrent()).toBe(false);
    await previous.callback();
    await targets.getSuggestionForElement(span).callback();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("rejects detached, unregistered and moved-out-of-scope elements", async () => {
    const open = jasmine.createSpy("open");
    registrations.push(targets.registerTarget(span, () => ({ open })));
    const suggestion = targets.getSuggestionForElement(span);
    span.remove();
    expect(targets.getSuggestionForElement(span)).toBe(null);
    await suggestion.callback();
    document.body.appendChild(span);
    expect(suggestion.isCurrent()).toBe(false);
    await suggestion.callback();
    expect(open).not.toHaveBeenCalled();
    span.remove();
    expect(targets.getSuggestionForElement(document.createElement("span"))).toBe(null);
  });
});

describe("the Jupyter hyperclick facade's DOM lifecycle", () => {
  let pkg;
  let view;

  afterEach(async () => {
    view?.destroy();
    view = null;
    if (pkg && lumine.packages.isPackageActive(pkg.name))
      await lumine.packages.deactivatePackage(pkg.name);
    if (pkg && lumine.packages.isPackageLoaded(pkg.name))
      await lumine.packages.unloadPackage(pkg.name);
    pkg = null;
  });

  it("preserves its word provider and revokes retained DOM callbacks when its package retires", async () => {
    pkg = lumine.packages.loadPackage(path.resolve(__dirname, ".."));
    await lumine.packages.activatePackage(pkg.name);
    const main = pkg.mainModule;
    const Traceback = require("../lib/components/result-view/traceback");
    const open = jasmine.createSpy("source");
    view = new Traceback({
      output: { traceback: ["Cell In[1], line 1"] },
      resolveTracebackFrame: () => ({ open }),
    });
    document.body.appendChild(view.element);
    const span = view.element.querySelector(".traceback-location");
    const provider = main.provideHyperclick();
    expect(typeof provider.getSuggestionForWord).toBe("function");
    expect(provider.elementSelector).toBe(".structured-traceback .traceback-location");
    const suggestion = provider.getSuggestionForElement(span);
    expect(suggestion.element).toBe(span);
    await lumine.packages.deactivatePackage(pkg.name);
    expect(provider.getSuggestionForElement(span)).toBeUndefined();
    expect(suggestion.isCurrent()).toBe(false);
    await suggestion.callback();
    expect(open).not.toHaveBeenCalled();
    await lumine.packages.activatePackage(pkg.name);
    const current = pkg.mainModule.provideHyperclick();
    expect(current).not.toBe(provider);
    await current.getSuggestionForElement(span).callback();
    expect(open).toHaveBeenCalledTimes(1);
    await suggestion.callback();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
