const { Disposable } = require("lumine");

// Lightweight internals used by assistance specs still enter through the real
// public Session, so its deadlines, cancellation and result shape are exercised.
function wrapSession(kernel) {
  kernel.id ||= "session-fixture";
  kernel.transport ||= { lifecycle: "ready" };
  kernel.onDidChangeExecutionState ||= () => new Disposable();
  kernel.onDidChangeStatus ||= () => new Disposable();
  const Session = require("../../lib/plugin-api/jupyter-kernel");
  const session = new Session(kernel);
  kernel.getPluginWrapper = () => session;
  return session;
}

module.exports = { wrapSession };
