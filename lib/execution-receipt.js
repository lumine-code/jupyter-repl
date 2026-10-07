const { randomUUID } = require("node:crypto");

/** Acceptance is separate from completion, including picker cancellation. */
function createReceipt({ owner, signal, onSettled } = {}) {
  let resolve;
  let settled = false;
  const controller = new AbortController();
  const subscriptions = [];
  const receipt = {
    id: randomUUID(),
    accepted: true,
    done: new Promise((done) => {
      resolve = done;
    }),
  };
  const finish = (outcome) => {
    if (settled) return;
    settled = true;
    controller.abort();
    for (const subscription of subscriptions) subscription?.dispose?.();
    signal?.removeEventListener("abort", abort);
    onSettled?.();
    resolve({
      ...outcome,
      ...(outcome.error instanceof Error
        ? {
            error: {
              ename: outcome.error.name || "ExecutionFailed",
              evalue: outcome.error.message || String(outcome.error),
              traceback: [],
            },
          }
        : {}),
    });
  };
  const abort = () => finish({ status: "cancelled", reason: "observation cancelled" });
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  if (!settled)
    subscriptions.push(
      owner?.onDidDestroy?.(() => finish({ status: "cancelled", reason: "owner closed" })),
    );
  return { receipt, finish, signal: controller.signal, isAlive: () => !settled };
}

function refused(reason) {
  return { accepted: false, done: Promise.resolve({ status: "unavailable", reason }) };
}

module.exports = { createReceipt, refused };
