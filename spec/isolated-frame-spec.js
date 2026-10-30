let IsolatedFrame;

describe("an isolated rich output", () => {
  let frame;

  beforeEach(async () => {
    const textGrammarPackage = await lumine.packages.activatePackage("language-text");
    await textGrammarPackage.resourceLoadPromise;
    jasmine.useRealClock();
    ({ IsolatedFrame } = require("../lib/components/result-view/isolated-frame"));
  });

  afterEach(async () => {
    await frame?.destroy();
    frame = null;
  });

  function mount(props) {
    frame = new IsolatedFrame(props);
    document.body.appendChild(frame.element);
    return frame;
  }

  it("executes scripts without Node, parent DOM or workers in the real renderer", async () => {
    let resolve;
    let reject;
    const result = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    mount({
      script: `
        let parentBlocked = false;
        let workerBlocked = false;
        try { void parent.document; } catch { parentBlocked = true; }
        try {
          const worker = new Worker(URL.createObjectURL(new Blob(['postMessage(typeof require)'])));
          worker.onerror = () => { workerBlocked = true; report(); };
        }
        catch { workerBlocked = true; }
        function report() { window.lumineOutput.send({ type: "probe", node: typeof require, process: typeof process, parentBlocked, workerBlocked }); }
        if (workerBlocked) report();
      `,
      onError: reject,
      onMessage: (data) => {
        if (data.type === "probe") resolve(data);
      },
    });
    const probe = await result;
    expect(probe.node).toBe("undefined");
    expect(probe.process).toBe("undefined");
    expect(probe.parentBlocked).toBe(true);
    expect(probe.workerBlocked).toBe(true);
    expect(frame.refs.frame.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("rejects another window even when it knows the nonce", () => {
    mount({});
    frame._connect({
      source: window,
      origin: "null",
      data: { type: "lumine-output-connect", nonce: frame.nonce },
    });
    expect(frame.port).toBe(null);
  });

  it("reserves shared output gutters inside the sandbox and omits chrome from checkpoints", async () => {
    let resolve;
    let reject;
    const measured = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    mount({
      html: '<div id="scroller" data-scrollbar="auto" style="width:120px;height:80px;overflow:auto"><div style="width:600px;height:600px">Scrollable output</div></div>',
      script: `
        window.lumineOutput.registerWindowState("overlay-test", { capture: () => ({}), restore() {} });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const scroller = document.getElementById("scroller");
          const track = document.querySelector(".lumine-scrollbar.vertical");
          scroller.scrollTop = 40;
          window.lumineOutput.send({ type: "overlay-probe", shared: !!window.LumineScrollbars,
            chrome: document.querySelectorAll("[data-scrollbar-chrome]").length,
            gutter: scroller.offsetWidth - scroller.clientWidth,
            bottomGutter: scroller.offsetHeight - scroller.clientHeight,
            inheritedLayout: document.body.dataset.scrollbarLayout,
            persistent: track.parentElement.classList.contains("is-persistent") });
        }));
      `,
      onError: reject,
      onMessage: (data) => {
        if (data.type === "overlay-probe") resolve(data);
      },
    });
    const probe = await measured;
    expect(probe.shared).toBeTrue();
    expect(probe.chrome).toBeGreaterThan(0);
    expect(probe.gutter).toBeGreaterThan(0);
    expect(probe.bottomGutter).toBeGreaterThan(0);
    expect(probe.inheritedLayout).toBe("gutter");
    expect(probe.persistent).toBe(true);
    const state = await frame.prepareWindowChange();
    expect(state.checkpoint.scroll.length).toBe(2);
    expect(state.checkpoint.scroll[0].top).toBe(40);
    state.dispose();
  });

  it("restarts a frame that connected before the window-change callback", async () => {
    let ready;
    const loaded = new Promise((resolve) => {
      ready = resolve;
    });
    mount({
      script: `let count = 42;
        window.lumineOutput.registerWindowState("counter", { capture: () => ({ count }), restore: state => { count = state.count; } });`,
      onReady: ready,
    });
    await loaded;
    const state = await frame.prepareWindowChange();
    state.dispose();
    const previousPort = frame.port;
    const previousNonce = frame.nonce;
    const previousFrame = frame.refs.frame;
    const previousFrameWindow = frame.refs.frame.contentWindow;
    spyOn(previousPort, "close").and.callThrough();

    // didAttachToWindow may already have bound the destination document and
    // accepted its automatic iframe bootstrap before didChangeWindow runs.
    frame.didAttachToWindow({ document });
    const changed = frame.didChangeWindow({ state });
    expect(previousPort.close).toHaveBeenCalledTimes(1);
    expect(frame.nonce).not.toBe(previousNonce);
    expect(frame.port).toBeNull();
    frame._connect({
      source: previousFrameWindow,
      origin: "null",
      data: { type: "lumine-output-connect", nonce: frame.nonce },
    });
    expect(frame.port).toBeNull();
    frame._connect({
      source: frame.refs.frame.contentWindow,
      origin: "null",
      data: { type: "lumine-output-connect", nonce: previousNonce },
    });
    expect(frame.port).toBeNull();
    await changed;

    expect(frame.refs.frame).toBe(previousFrame);
    expect(frame.refs.frame.contentWindow === previousFrameWindow).toBeFalse();
    expect(frame.ready).toBeTrue();
    const restored = await frame.prepareWindowChange();
    expect(restored.checkpoint.handlers[0].state).toEqual({ count: 42 });
    restored.dispose();
  });

  it("checkpoints interactive state before a pane moves and reconnects in the destination", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    let ready;
    const loaded = new Promise((resolve) => {
      ready = resolve;
    });
    mount({
      html: '<input id="value" value="initial">',
      script: `
        let count = 7;
        document.getElementById("value").value = "edited";
        window.lumineOutput.registerWindowState("counter", {
          capture: () => ({ count }),
          restore: (state) => { count = state.count; }
        });
      `,
      onReady: ready,
    });
    await loaded;
    const item = {
      canCopy: () => false,
      getTitle: () => "Interactive output",
      getElement: () => frame.element,
    };
    await lumine.workspace.open(item);
    const pane = lumine.workspace.paneForItem(item);
    const checkpoint = await frame.prepareWindowChange();
    expect(checkpoint.checkpoint.handlers[0].state).toEqual({ count: 7 });
    expect(checkpoint.checkpoint.controls[0].value).toBe("edited");
    checkpoint.dispose();
    const extra = await lumine.workspace.detachPane(pane);
    try {
      await globalThis.conditionPromise(() => frame.ready);
      const restored = await frame.prepareWindowChange();
      expect(restored.checkpoint.handlers[0].state).toEqual({ count: 7 });
      expect(restored.checkpoint.controls[0].value).toBe("edited");
      restored.dispose();
      expect(frame.element.ownerDocument).toBe(extra.getDocument());
      await lumine.workspace.attachWindow(extra);
      await globalThis.conditionPromise(() => frame.ready);
    } finally {
      await lumine.workspace.discardEditorWindows();
    }
  });

  it("rejects a stale window transfer after its output is destroyed", async () => {
    mount({});
    await frame.destroy();
    await expectAsync(frame.didChangeWindow({ state: { checkpoint: null } })).toBeRejectedWithError(
      "The output was closed during a window transfer.",
    );
    expect(frame.port).toBeNull();
    expect(frame.windowChange).toBeUndefined();
  });

  it("reconnects the last captured interactive state after the native host disappears", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    let ready;
    const loaded = new Promise((resolve) => {
      ready = resolve;
    });
    mount({
      html: '<input id="value" value="initial">',
      script: `let count = 42;
        document.getElementById("value").value = "captured";
        window.lumineOutput.registerWindowState("counter", { capture: () => ({ count }), restore: state => { count = state.count; } });`,
      onReady: ready,
    });
    await loaded;
    const item = {
      canCopy: () => false,
      getTitle: () => "Recovered output",
      getElement: () => frame.element,
    };
    await lumine.workspace.open(item);
    const extra = await lumine.workspace.detachItem(item);
    await globalThis.conditionPromise(() => frame.ready);
    const checkpoint = await frame.prepareWindowChange();
    checkpoint.dispose();
    await extra.windowService.close();
    await globalThis.conditionPromise(() => extra.isDestroyed());
    await globalThis.conditionPromise(() => frame.ready);
    expect(frame.element.ownerDocument).toBe(document);
    const restored = await frame.prepareWindowChange();
    expect(restored.checkpoint.handlers[0].state).toEqual({ count: 42 });
    expect(restored.checkpoint.controls[0].value).toBe("captured");
    restored.dispose();
  });

  it("keeps an output with uncheckpointable script state in its original pane", async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    let ready;
    const loaded = new Promise((resolve) => {
      ready = resolve;
    });
    mount({ script: "let privateState = 17;", onReady: ready });
    await loaded;
    const item = {
      canCopy: () => false,
      getTitle: () => "Uncheckpointable output",
      getElement: () => frame.element,
    };
    await lumine.workspace.open(item);
    const pane = lumine.workspace.paneForItem(item);
    await expectAsync(lumine.workspace.detachPane(pane)).toBeRejectedWithError(
      /no window state checkpoint handler/,
    );
    expect(lumine.workspace.paneForItem(item)).toBe(pane);
    expect(frame.element.ownerDocument).toBe(document);
    expect(frame.ready).toBeTrue();
  });

  it("keeps dynamic opaque-origin output within its height bounds", async () => {
    mount({
      html: '<div id="sized" style="height:120px"></div>',
      script: `window.lumineOutput.onMessage(data => {
        if (data.type === "set-size") {
          document.getElementById("sized").style.height = data.height + "px";
        }
      });`,
      minHeight: 48,
      maxHeight: 240,
    });
    const received = spyOn(frame, "_receive").and.callThrough();
    await globalThis.conditionPromise(() => frame.ready);
    const iframe = frame.refs.frame;
    await globalThis.conditionPromise(
      () => Math.round(iframe.getBoundingClientRect().height) === 120,
    );
    frame.postMessage({ type: "set-size", height: 600 });
    // Dynamic widget updates must resize even after the document has loaded.
    await globalThis.conditionPromise(
      () => Math.round(frame.refs.frame.getBoundingClientRect().height) === 240,
    );
    frame.postMessage({ type: "set-size", height: 0 });
    await globalThis.conditionPromise(
      () => Math.round(frame.refs.frame.getBoundingClientRect().height) === 48,
    );
    expect(received.calls.allArgs().map(([data]) => data.type)).toContain("lumine-output-resize");
    expect(frame.refs.frame.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("bounds iframe height and ignores malformed measurements", () => {
    mount({ maxHeight: 800 });
    frame._receive({ type: "lumine-output-resize", height: 900000 });
    expect(frame.refs.frame.style.height).toBe("800px");
    frame._receive({ type: "lumine-output-resize", height: -1 });
    expect(frame.refs.frame.style.height).toBe("24px");
    frame._receive({ type: "lumine-output-resize", height: "NaN" });
    expect(frame.refs.frame.style.height).toBe("24px");
  });

  it("runs async child cleanup before disposing its browsing context", async () => {
    let ready;
    const initialized = new Promise((resolve) => {
      ready = resolve;
    });
    mount({
      script: `window.lumineOutput.onDispose(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });`,
      onReady: ready,
    });
    await initialized;
    expect(typeof document.body.moveBefore).toBe("function");
    const iframe = frame.refs.frame;
    const keyboardHost = frame.keyboardHost;
    spyOn(keyboardHost, "dispose").and.callThrough();
    const received = [];
    const original = frame._receive.bind(frame);
    frame._receive = (data) => {
      received.push(data.type);
      original(data);
    };
    const destruction = frame.destroy();
    expect(keyboardHost.dispose).toHaveBeenCalledTimes(1);
    expect(iframe.style.display).toBe("none");
    await destruction;
    await frame.destroy();
    expect(keyboardHost.dispose).toHaveBeenCalledTimes(1);
    expect(received).toContain("lumine-output-disposed");
    expect(iframe.isConnected).toBe(false);
    expect(frame.port).toBe(null);
    expect(frame.postMessage({ type: "late" })).toBe(false);
  });
});
