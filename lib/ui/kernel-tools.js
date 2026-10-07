const { CompositeDisposable, Disposable } = require("lumine");
const { MONITOR_URI } = require("./monitor/utils");

/** Own the optional runtime views without loading them during bootstrap. */
function createKernelTools({ getProvider, executePrompt, ensureEtch }) {
  let subscriptions = null;
  let prompt = null;
  let monitor = null;
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

  function getMonitorPane() {
    if (monitor && !monitor.destroyed) return monitor;
    const existing = lumine.workspace
      .getPaneItems()
      .find((item) => item.getURI?.() === MONITOR_URI);
    if (existing) monitor = existing;
    else {
      ensureEtch();
      const MonitorPane = require("./monitor/monitor-pane");
      monitor = new MonitorPane(subscriptions ? getProvider() : null);
    }
    const item = monitor;
    item.onDidDestroy(() => {
      if (monitor === item) monitor = null;
    });
    return item;
  }

  function destroyViews() {
    prompt?.destroy();
    prompt = null;
    const panes = new Set(
      lumine.workspace.getPaneItems().filter((item) => item.getURI?.() === MONITOR_URI),
    );
    if (monitor) panes.add(monitor);
    monitor = null;
    for (const item of panes) item.destroy();
    for (const request of inputViews.keys()) closeInput(request);
  }

  function dispose() {
    generation++;
    const previous = subscriptions;
    subscriptions = null;
    previous?.dispose();
    for (const session of sessions.keys()) releaseSession(session);
    destroyViews();
  }

  function activate() {
    const activeGeneration = ++generation;
    subscriptions?.dispose();
    const owned = (subscriptions = new CompositeDisposable(
      lumine.commands.add("lumine-workspace", {
        "jupyter-repl:toggle-prompt-focus": () => togglePrompt(),
        "jupyter-repl:toggle-kernel-monitor-focus": () => toggleMonitorFocus(),
      }),
      lumine.workspace.addOpener((uri) => (uri === MONITOR_URI ? getMonitorPane() : undefined)),
    ));
    queueMicrotask(() => {
      if (subscriptions !== owned || generation !== activeGeneration) return;
      const provider = getProvider();
      if (!provider) return;
      followSessions(provider);
      if (provider.onDidChangeKernels)
        owned.add(provider.onDidChangeKernels(() => followSessions(provider)));
      if (monitor && monitor.component?.provider !== provider) monitor.setProvider(provider);
    });
    return new Disposable(() => {
      if (subscriptions === owned) dispose();
    });
  }

  function togglePrompt() {
    if (!prompt || prompt.destroyed) {
      const PromptPanel = require("./prompt/prompt-panel");
      prompt = new PromptPanel(() => getProvider()?.getActiveKernel() || null, executePrompt);
    }
    return prompt.toggleFocus();
  }

  async function toggleMonitorFocus() {
    const pane = lumine.workspace.paneForURI(MONITOR_URI);
    const element = pane?.element;
    const focused =
      element &&
      (element.offsetWidth !== 0 || element.offsetHeight !== 0) &&
      element.contains(document.activeElement);
    if (focused) return lumine.workspace.getCenter().activate();
    const item = await lumine.workspace.open(MONITOR_URI, { searchAllPanes: true });
    if (item === monitor && !item.destroyed) item.focus();
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
    togglePrompt,
    toggleMonitorFocus,
    renameSession,
    deserializeMonitorPane: getMonitorPane,
    dispose,
  };
}

module.exports = { createKernelTools, MONITOR_URI };
