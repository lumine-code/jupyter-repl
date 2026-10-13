const path = require("node:path");
const { createRequire } = require("node:module");
const requireCurrent = createRequire(path.join(__dirname, "..", "package.json"));

class FakeWorker {
  constructor() {
    this.requests = [];
    this.terminations = 0;
  }

  postMessage(request) {
    this.requests.push(request);
  }

  terminate() {
    this.terminations++;
  }

  reply(request, result = {}) {
    this.onmessage?.({ data: { id: request.id, ...result } });
  }
}

function fakeTime() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  spyOn(globalThis, "setTimeout").and.callFake((callback, delay) => {
    const id = ++nextId;
    timers.set(id, { callback, at: now + delay });
    return id;
  });
  spyOn(globalThis, "clearTimeout").and.callFake((id) => timers.delete(id));
  return (delta) => {
    now += delta;
    for (const [id, timer] of [...timers]) {
      if (timer.at > now) continue;
      timers.delete(id);
      timer.callback();
    }
  };
}

// Rendering/font regressions use the real worker in latex-spec. These tests
// make worker failure and disposal deterministic without loading MathJax.
describe("the persistent MathJax worker client", () => {
  let MathJaxClient, client, createWorker, workers;

  beforeEach(() => {
    ({ MathJaxClient } = requireCurrent("./lib/mathjax-client"));
    workers = [];
    createWorker = jasmine.createSpy("create MathJax worker").and.callFake(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    client = new MathJaxClient({ createWorker });
  });

  afterEach(() => client.dispose());

  it("starts lazily and warms the same worker only once", async () => {
    expect(createWorker).not.toHaveBeenCalled();
    let warmed = false;
    const first = client.warm().then(() => {
      warmed = true;
    });
    const second = client.warm();
    const worker = workers[0];
    expect(createWorker.calls.count()).toBe(1);
    expect(worker.requests.length).toBe(1);
    expect(worker.requests[0].type).toBe("warm");
    await Promise.resolve();
    expect(warmed).toBe(false);

    worker.reply(worker.requests[0]);
    await Promise.all([first, second]);
    expect(warmed).toBe(true);
    await client.warm();
    expect(worker.requests.length).toBe(1);
    expect(createWorker.calls.count()).toBe(1);
  });

  it("sends complete bundles in caller order through one worker", async () => {
    const first = client.render("$a$ and $b$");
    const second = client.render("$c$");
    const worker = workers[0];
    expect(createWorker.calls.count()).toBe(1);
    expect(worker.requests.map(({ type, source }) => ({ type, source }))).toEqual([
      { type: "render", source: "$a$ and $b$" },
      { type: "render", source: "$c$" },
    ]);
    const firstRuns = [{ kind: "text", text: "first bundle" }];
    const secondRuns = [{ kind: "text", text: "second bundle" }];
    worker.reply(worker.requests[0], { runs: firstRuns });
    worker.reply(worker.requests[1], { runs: secondRuns });
    expect(await first).toEqual(firstRuns);
    expect(await second).toEqual(secondRuns);

    const later = client.render("$d$");
    worker.reply(worker.requests[2], { runs: [] });
    expect(await later).toEqual([]);
    expect(createWorker.calls.count()).toBe(1);
  });

  it("matches replies to their requests even if they arrive out of order", async () => {
    const first = client.render("$a$");
    const second = client.render("$b$");
    const worker = workers[0];
    expect(worker.requests[0].id).not.toBe(worker.requests[1].id);
    const firstRuns = [{ kind: "text", text: "a" }];
    const secondRuns = [{ kind: "text", text: "b" }];
    worker.reply(worker.requests[1], { runs: secondRuns });
    worker.reply(worker.requests[0], { runs: firstRuns });
    expect(await first).toEqual(firstRuns);
    expect(await second).toEqual(secondRuns);
  });

  it("rejects an individual conversion failure and keeps the worker usable", async () => {
    const failed = client.render("$a$").catch((error) => error);
    const valid = client.render("$b$");
    const worker = workers[0];
    worker.reply(worker.requests[0], { error: { message: "conversion failed" } });
    const runs = [{ kind: "text", text: "b" }];
    worker.reply(worker.requests[1], { runs });
    expect((await failed).message).toBe("conversion failed");
    expect(await valid).toEqual(runs);
    expect(worker.terminations).toBe(0);
    expect(createWorker.calls.count()).toBe(1);
  });

  it("retries a failed initialization without replacing a healthy worker", async () => {
    const failed = client.warm().catch((error) => error);
    const worker = workers[0];
    worker.reply(worker.requests[0], { error: { message: "initialization failed" } });
    expect((await failed).message).toBe("initialization failed");
    const retry = client.warm();
    expect(worker.requests[1].type).toBe("warm");
    worker.reply(worker.requests[1]);
    await retry;
    expect(createWorker.calls.count()).toBe(1);
    expect(worker.terminations).toBe(0);
  });

  it("rejects malformed results and retires the worker instead of leaving queued work pending", async () => {
    const first = client.render("$a$").catch((error) => error);
    const second = client.render("$b$").catch((error) => error);
    const worker = workers[0];
    worker.reply(worker.requests[0], { runs: { unexpected: "object" } });
    for (const outcome of await Promise.all([first, second])) {
      expect(outcome.message).toContain("invalid result");
    }
    expect(worker.terminations).toBe(1);
    const retry = client.render("$c$");
    workers[1].reply(workers[1].requests[0], { runs: [] });
    expect(await retry).toEqual([]);
  });

  it("rejects every pending request on a worker error and allows a fresh warm-up", async () => {
    const warm = client.warm().catch((error) => error);
    const first = client.render("$a$").catch((error) => error);
    const second = client.render("$b$").catch((error) => error);
    const failedWorker = workers[0];
    failedWorker.onerror({ message: "worker crashed", preventDefault() {} });
    for (const outcome of await Promise.all([warm, first, second])) {
      expect(outcome.message).toContain("worker crashed");
    }
    expect(failedWorker.terminations).toBe(1);

    const retry = client.warm();
    const replacement = workers[1];
    expect(replacement.requests[0].type).toBe("warm");
    replacement.reply(replacement.requests[0]);
    await retry;
    const rendered = client.render("$c$");
    replacement.reply(replacement.requests[1], { runs: [] });
    expect(await rendered).toEqual([]);
    expect(createWorker.calls.count()).toBe(2);
  });

  it("rejects pending work on an unreadable worker message and permits retry", async () => {
    const first = client.render("$a$").catch((error) => error);
    const second = client.render("$b$").catch((error) => error);
    const failedWorker = workers[0];
    failedWorker.onmessageerror({});
    for (const outcome of await Promise.all([first, second])) {
      expect(outcome).toEqual(jasmine.any(Error));
    }
    expect(failedWorker.terminations).toBe(1);

    const retry = client.render("$c$");
    const replacement = workers[1];
    replacement.reply(replacement.requests[0], { runs: [] });
    expect(await retry).toEqual([]);
    expect(createWorker.calls.count()).toBe(2);
  });

  it("ignores replies from a retired worker while its replacement is rendering", async () => {
    const failed = client.render("$old$").catch((error) => error);
    const oldWorker = workers[0];
    const oldReceive = oldWorker.onmessage;
    oldWorker.onerror({ message: "worker crashed", preventDefault() {} });
    expect(await failed).toEqual(jasmine.any(Error));

    let settled = false;
    const next = client.render("$new$").then((runs) => {
      settled = true;
      return runs;
    });
    const replacement = workers[1];
    oldReceive({ data: { id: replacement.requests[0].id, runs: [{ kind: "text", text: "old" }] } });
    await Promise.resolve();
    expect(settled).toBe(false);
    const newRuns = [{ kind: "text", text: "new" }];
    replacement.reply(replacement.requests[0], { runs: newRuns });
    expect(await next).toEqual(newRuns);
  });

  it("settles pending work and permanently retires the client on disposal", async () => {
    const warm = client.warm().catch((error) => error);
    const rendering = client.render("$a$").catch((error) => error);
    const worker = workers[0];
    client.dispose();
    client.dispose();
    for (const outcome of await Promise.all([warm, rendering])) {
      expect(outcome).toEqual(jasmine.any(Error));
    }
    expect(worker.terminations).toBe(1);
    await expectAsync(client.warm()).toBeRejected();
    await expectAsync(client.render("$b$")).toBeRejected();
    expect(createWorker.calls.count()).toBe(1);
  });

  it("releases the worker's bootstrap resource on failure and disposal", async () => {
    client.dispose();
    const releases = [];
    createWorker.and.callFake(() => {
      const worker = new FakeWorker();
      const dispose = jasmine.createSpy("release worker bootstrap");
      workers.push(worker);
      releases.push(dispose);
      return { worker, dispose };
    });
    client = new MathJaxClient({ createWorker });
    const failed = client.render("$a$").catch((error) => error);
    workers[0].onerror({ message: "worker crashed", preventDefault() {} });
    await failed;
    expect(releases[0].calls.count()).toBe(1);

    const next = client.render("$b$").catch((error) => error);
    client.dispose();
    await next;
    expect(releases[1].calls.count()).toBe(1);
    expect(workers.map((worker) => worker.terminations)).toEqual([1, 1]);
  });

  it("allows another attempt after worker construction fails", async () => {
    createWorker.and.throwError("worker construction failed");
    await expectAsync(client.warm()).toBeRejectedWithError("worker construction failed");
    createWorker.and.callFake(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const retry = client.render("$a$");
    const worker = workers[0];
    worker.reply(worker.requests[0], { runs: [] });
    expect(await retry).toEqual([]);
  });

  it("settles all requests when posting to the worker fails", async () => {
    const warm = client.warm().catch((error) => error);
    const worker = workers[0];
    spyOn(worker, "postMessage").and.throwError("post failed");
    const rendering = client.render("$a$").catch((error) => error);
    for (const outcome of await Promise.all([warm, rendering])) {
      expect(outcome.message).toContain("post failed");
    }
    expect(worker.terminations).toBe(1);
  });

  it("times out a silent worker even while more requests are queued", async () => {
    const advance = fakeTime();
    client.dispose();
    client = new MathJaxClient({ createWorker, timeoutMs: 100 });
    const first = client.render("$a$").catch((error) => error);
    advance(60);
    const second = client.render("$b$").catch((error) => error);
    advance(40);
    for (const outcome of await Promise.all([first, second])) {
      expect(outcome.message).toContain("stopped responding");
    }
    expect(workers[0].terminations).toBe(1);
    const retry = client.render("$c$");
    workers[1].reply(workers[1].requests[0], { runs: [] });
    expect(await retry).toEqual([]);
  });

  it("allows queued work to finish while valid replies keep making progress", async () => {
    const advance = fakeTime();
    client.dispose();
    client = new MathJaxClient({ createWorker, timeoutMs: 100 });
    const first = client.render("$a$");
    let settled = false;
    const second = client.render("$b$").then((runs) => {
      settled = true;
      return runs;
    });
    const worker = workers[0];
    advance(60);
    worker.reply(worker.requests[0], { runs: [] });
    expect(await first).toEqual([]);
    advance(60);
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(worker.terminations).toBe(0);
    worker.reply(worker.requests[1], { runs: [] });
    expect(await second).toEqual([]);
    advance(1000);
    expect(worker.terminations).toBe(0);
  });

  it("does not count unknown replies as progress for a stalled request", async () => {
    const advance = fakeTime();
    client.dispose();
    client = new MathJaxClient({ createWorker, timeoutMs: 100 });
    const rendering = client.render("$a$").catch((error) => error);
    const worker = workers[0];
    advance(60);
    worker.reply({ id: "unknown request" }, { runs: [] });
    advance(40);
    expect((await rendering).message).toContain("stopped responding");
    expect(worker.terminations).toBe(1);
  });
});
