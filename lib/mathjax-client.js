const path = require("node:path");
const { randomUUID } = require("node:crypto");

function createBrowserWorker(generation) {
  // Module generations have virtual filenames; __dirname remains the source
  // directory. Workers use their own Node cache and load physical files.
  const entry = path.join(__dirname, "mathjax-worker.js");
  const script = `require(${JSON.stringify(entry)}).start(${JSON.stringify(generation)});`;
  const url = URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
  try {
    return { worker: new Worker(url), dispose: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** One persistent renderer, shared by every output and presentation window. */
class MathJaxClient {
  constructor({ createWorker = createBrowserWorker, timeoutMs = 30000 } = {}) {
    this.createWorker = createWorker;
    this.timeoutMs = timeoutMs;
    this.record = null;
    this.pending = new Map();
    this.nextId = 0;
    this.warmPromise = null;
    this.timer = null;
    this.disposed = false;
  }

  ensureWorker() {
    if (this.record) return this.record;
    const resource = this.createWorker(randomUUID());
    const record = resource.worker ? resource : { worker: resource };
    this.record = record;
    const { worker } = record;
    worker.onmessage = ({ data }) => {
      if (this.record !== record) return;
      const request = this.pending.get(data?.id);
      if (!request) return;
      this.pending.delete(data.id);
      if (data.error) {
        const error = new Error(data.error.message || "MathJax rendering failed");
        if (data.error.stack) error.stack = data.error.stack;
        request.reject(error);
      } else if (request.type === "render" && !Array.isArray(data.runs)) {
        const error = new Error("MathJax worker returned an invalid result");
        request.reject(error);
        this.fail(error);
      } else {
        request.resolve(data.runs);
      }
      this.watchProgress();
    };
    worker.onerror = (event) => {
      if (this.record !== record) return;
      event.preventDefault?.();
      this.fail(new Error(event.message || "MathJax worker failed"));
    };
    worker.onmessageerror = () => {
      if (this.record === record) this.fail(new Error("MathJax worker result could not be read"));
    };
    return record;
  }

  watchProgress() {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return;
    // A queued job can wait behind many valid conversions. Limit inactivity
    // of the whole queue rather than timing each request from its enqueue.
    this.timer = setTimeout(() => {
      this.fail(new Error("MathJax worker stopped responding"));
    }, this.timeoutMs);
  }

  request(type, source) {
    if (this.disposed) return Promise.reject(new Error("MathJax renderer was disposed"));
    return new Promise((resolve, reject) => {
      try {
        const { worker } = this.ensureWorker();
        const id = ++this.nextId;
        const idle = this.pending.size === 0;
        this.pending.set(id, { type, resolve, reject });
        if (idle) this.watchProgress();
        worker.postMessage({ id, type, ...(type === "render" ? { source } : {}) });
      } catch (error) {
        this.fail(error);
        reject(error);
      }
    });
  }

  warm() {
    if (!this.warmPromise) {
      const promise = this.request("warm");
      this.warmPromise = promise;
      promise.catch(() => {
        if (this.warmPromise === promise) this.warmPromise = null;
      });
    }
    return this.warmPromise;
  }

  render(source) {
    return this.request("render", source || "");
  }

  fail(error) {
    clearTimeout(this.timer);
    this.timer = null;
    const record = this.record;
    this.record = null;
    this.warmPromise = null;
    if (record) {
      record.worker.onmessage = null;
      record.worker.onerror = null;
      record.worker.onmessageerror = null;
      record.worker.terminate();
      record.dispose?.();
    }
    const pending = this.pending;
    this.pending = new Map();
    for (const request of pending.values()) request.reject(error);
  }

  dispose() {
    this.disposed = true;
    this.fail(new Error("MathJax renderer was disposed"));
  }
}

let client = null;
function getClient() {
  return (client ||= new MathJaxClient());
}

function warmMathJax() {
  return getClient().warm();
}

function renderLatexRuns(source) {
  return getClient().render(source);
}

function disposeMathJax() {
  const previous = client;
  client = null;
  previous?.dispose();
}

module.exports = { MathJaxClient, warmMathJax, renderLatexRuns, disposeMathJax };
