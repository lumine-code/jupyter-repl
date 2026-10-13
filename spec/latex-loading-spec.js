const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const requireCurrent = createRequire(path.join(__dirname, "..", "package.json"));

describe("the LaTeX waiting indicator", () => {
  let etch,
    LaTeX,
    renderStatus,
    component,
    host,
    kernelHost,
    stylesheet,
    previousScheduler,
    resolve;

  beforeEach(() => {
    etch = requireCurrent("@lumine-code/etch");
    ({ LaTeX } = requireCurrent("./lib/components/result-view/latex"));
    ({ renderStatus } = requireCurrent("./lib/components/result-view/status"));
    const client = requireCurrent("./lib/mathjax-client");
    spyOn(client, "renderLatexRuns").and.returnValue(
      new Promise((complete) => {
        resolve = complete;
      }),
    );
    // The worker reply is explicitly deferred; DOM patches need no frame timer.
    previousScheduler = etch.getScheduler();
    etch.setScheduler({
      updateDocument: (callback) => callback(),
      readDocument: (callback) => callback(),
      getNextUpdatePromise: () => Promise.resolve(),
    });
    stylesheet = lumine.styles.addStyleSheet(
      fs.readFileSync(path.join(__dirname, "..", "styles", "main.css"), "utf8"),
    );
    kernelHost = document.createElement("div");
    kernelHost.className = "jupyter-repl";
    kernelHost.appendChild(etch.render(renderStatus("running")));
    document.body.appendChild(kernelHost);
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(async () => {
    await component?.destroy();
    component = null;
    host.remove();
    kernelHost.remove();
    stylesheet.dispose();
    etch.setScheduler(previousScheduler);
  });

  for (const scope of ["jupyter-repl", "notebook-output"]) {
    it(`uses the kernel waiting animation in ${scope} until SVG is ready`, async () => {
      host.className = scope;
      component = new LaTeX({ data: "$x$" });
      host.appendChild(component.element);
      const root = component.element;
      const waiting = root.querySelectorAll(":scope > div");
      const kernelWaiting = kernelHost.querySelectorAll(".spinner > div");
      expect(root.textContent).toBe("");
      expect(root.classList.contains("spinner")).toBe(true);
      expect(root.querySelector(".inline-container")).toBeNull();
      expect(waiting.length).toBe(kernelWaiting.length);
      expect(waiting.length).toBeGreaterThan(0);
      for (let index = 0; index < waiting.length; index++) {
        const animation = getComputedStyle(waiting[index]);
        const kernelAnimation = getComputedStyle(kernelWaiting[index]);
        expect(animation.animationName).toBe("stretchdelay");
        expect(animation.animationDuration).toBe(kernelAnimation.animationDuration);
        expect(animation.animationDelay).toBe(kernelAnimation.animationDelay);
      }

      resolve([
        { kind: "math", display: false, svg: '<svg xmlns="http://www.w3.org/2000/svg" />' },
      ]);
      await Promise.resolve();
      await Promise.resolve();
      expect(component.element).toBe(root);
      expect(root.querySelector("svg")).not.toBeNull();
      expect(root.classList.contains("spinner")).toBe(false);
      expect(root.classList.contains("output-latex-loading")).toBe(false);
    });
  }
});
