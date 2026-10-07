const { CompositeDisposable, Disposable } = require("lumine");

/** Own kernel input and rename views without loading them during bootstrap. */
function createInputController({ getProvider }) {
  let subscriptions = null;
  let generation = 0;
  const sessions = new Map();
  const inputViews = new Map();

  function closeInput(request) {
    const record = inputViews.get(request);
    if (!record) return;
    inputViews.delete(request);
    record.subscription?.dispose();
    record.view.close();
  }

  function closeSessionInputs(session) {
    for (const [request, record] of inputViews) {
      if (record.session === session) closeInput(request);
    }
  }

  function showInput(session, request) {
    if (!subscriptions || session.isDestroyed()) return;
    const InputView = require("../input-view");
    const view = new InputView(
      {
        prompt: request.prompt,
        password: request.password,
        defaultText: request.defaultText,
        allowCancel: request.allowCancel,
      },
      (value) => {
        closeInput(request);
        request.reply(value);
      },
    );
    const record = { session, view, subscription: null };
    const close = view.close.bind(view);
    view.close = () => {
      if (inputViews.get(request) === record) {
        inputViews.delete(request);
        record.subscription?.dispose();
      }
      close();
    };
    inputViews.set(request, record);
    record.subscription = request.onDidClose(() => closeInput(request));
    view.attach();
  }

  function releaseSession(session) {
    const subscription = sessions.get(session);
    sessions.delete(session);
    closeSessionInputs(session);
    subscription?.dispose();
  }

  function followSessions(provider) {
    const running = new Set(provider.getRunningKernels());
    for (const session of sessions.keys()) {
      if (!running.has(session)) releaseSession(session);
    }
    for (const session of running) {
      if (sessions.has(session)) continue;
      const ownership = new CompositeDisposable();
      sessions.set(session, ownership);
      if (session.onDidRequestInput)
        ownership.add(session.onDidRequestInput((request) => showInput(session, request)));
      if (session.onDidChangeGeneration)
        ownership.add(session.onDidChangeGeneration(() => closeSessionInputs(session)));
      if (session.onDidDestroy) ownership.add(session.onDidDestroy(() => releaseSession(session)));
    }
  }

  function dispose() {
    generation++;
    const previous = subscriptions;
    subscriptions = null;
    previous?.dispose();
    for (const session of sessions.keys()) releaseSession(session);
    for (const request of inputViews.keys()) closeInput(request);
  }

  function activate() {
    const activeGeneration = ++generation;
    subscriptions?.dispose();
    const owned = (subscriptions = new CompositeDisposable());
    queueMicrotask(() => {
      if (subscriptions !== owned || generation !== activeGeneration) return;
      const provider = getProvider();
      if (!provider) return;
      followSessions(provider);
      if (provider.onDidChangeKernels)
        owned.add(provider.onDidChangeKernels(() => followSessions(provider)));
    });
    return new Disposable(() => {
      if (subscriptions === owned) dispose();
    });
  }

  function renameSession(session) {
    if (!session?.capabilities.rename || session.isDestroyed()) return;
    showInput(session, {
      prompt: "Name your current session",
      defaultText: session.name,
      allowCancel: true,
      reply: (name) =>
        Promise.resolve(session.rename(name)).catch((error) =>
          lumine.notifications.addError("Unable to rename the Jupyter session", {
            detail: error.message || String(error),
          }),
        ),
      onDidClose: (callback) => session.onDidChangeGeneration(callback),
    });
  }

  return {
    activate,
    renameSession,
    dispose,
  };
}

module.exports = { createInputController };
