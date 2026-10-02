let IsolatedFrame;

describe("an isolated rich output", () => {
  let frame;

  beforeEach(() => {
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
    const received = [];
    const original = frame._receive.bind(frame);
    frame._receive = (data) => {
      received.push(data.type);
      original(data);
    };
    await frame.destroy();
    expect(received).toContain("lumine-output-disposed");
    expect(iframe.isConnected).toBe(false);
    expect(frame.port).toBe(null);
    expect(frame.postMessage({ type: "late" })).toBe(false);
  });
});
