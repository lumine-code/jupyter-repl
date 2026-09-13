const WSKernelPicker = require("../lib/ws-kernel-picker");
const Config = require("../lib/config");

// The picker chains modal steps on the workspace breadcrumb trail: gateway,
// credentials when needed, then a session or a kernel spec. The network edge
// is stubbed at the picker's own wrappers, so these specs drive the real
// lists, dialogs, and trail.
describe("ws-kernel-picker modal flow", () => {
  let picker;

  const GATEWAYS = [
    { name: "local", options: { baseUrl: "http://localhost:8888" } },
    { name: "tokened", options: { baseUrl: "http://localhost:9999", token: "preset" } },
  ];

  beforeEach(() => {
    spyOn(Config, "getJson").and.returnValue(GATEWAYS);
    picker = new WSKernelPicker(() => {});
    spyOn(picker, "checkGatewayReachable").and.callFake(() => Promise.resolve());
    spyOn(picker, "fetchSpecs").and.callFake(() =>
      Promise.resolve({
        kernelspecs: { python3: { name: "python3", display_name: "Python 3" } },
      }),
    );
    spyOn(picker, "fetchSessions").and.callFake(() => Promise.resolve([]));
  });

  afterEach(() => {
    picker.destroy();
  });

  async function confirmItem(list, id) {
    await list.selectItemById(id);
    await list.confirmSelection();
  }

  it("opens the gateway list", async () => {
    await picker.toggle(() => true);
    expect(picker.gatewayListHost.isVisible()).toBeTruthy();
    expect(picker.gatewayList.getItems().map((item) => item.name)).toEqual(["local", "tokened"]);
  });

  it("asks for an authentication method when the gateway has no token", async () => {
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "local");

    expect(picker.authListHost.isVisible()).toBeTruthy();
    expect(picker.authList.getInfoMessage()).toBe("Authenticate with local");
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication"]);
  });

  it("prompts for a masked token and reaches the gateway's sessions", async () => {
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "local");
    await confirmItem(picker.authList, "token");

    expect(picker.credentialDialogHost.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication", "Token"]);
    picker.credentialDialog.getQueryEditor().setText("secret");
    expect(picker.credentialDialog.getQueryEditor().element.style.webkitTextSecurity).toBe("disc");

    await lumine.commands.dispatch(picker.credentialDialog.getElement(), "core:confirm");

    expect(picker._flow.gatewayOptions.token).toBe("secret");
    expect(picker.sessionListHost.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual([
      "Gateways",
      "Authentication",
      "Token",
      "local",
    ]);
    expect(picker.sessionList.getItems().map((item) => item.name)).toEqual(["[new session]"]);
  });

  it("skips the authentication steps for a preconfigured token", async () => {
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "tokened");

    expect(picker.sessionListHost.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened"]);
  });

  it("keeps an empty credential in the dialog with an error message", async () => {
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "local");
    await confirmItem(picker.authList, "token");

    await lumine.commands.dispatch(picker.credentialDialog.getElement(), "core:confirm");

    expect(picker.credentialDialogHost.isVisible()).toBeTruthy();
    expect(picker.credentialDialog.getStatus()).toEqual({
      type: "error",
      message: "Enter a token.",
    });
    expect(picker.credentialDialog.getElement().textContent).toContain("Enter a token.");
    expect(picker.sessionListHost.isVisible()).toBeFalsy();
  });

  it("backs up one step to retry after an authentication failure", async () => {
    picker.fetchSpecs.and.callFake(() => Promise.reject({ response: { status: 401 } }));
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "local");
    await confirmItem(picker.authList, "token");
    picker.credentialDialog.getQueryEditor().setText("wrong");
    await lumine.commands.dispatch(picker.credentialDialog.getElement(), "core:confirm");

    expect(picker.sessionListHost.isVisible()).toBeFalsy();
    expect(picker.credentialDialogHost.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication", "Token"]);
  });

  it("lists kernel specs for a new session and navigates back to the sessions", async () => {
    await picker.toggle(() => true);
    await confirmItem(picker.gatewayList, "tokened");

    const newSession = picker.sessionList.getItems()[0];
    await confirmItem(picker.sessionList, "new-session");

    expect(picker.specListHost.isVisible()).toBeTruthy();
    expect(picker.specList.getInfoMessage()).toBe("Select a kernel spec");
    expect(picker.specList.getItems().map((item) => item.name)).toEqual(["Python 3"]);
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened", "New session"]);

    expect(lumine.workspace.popModal()).toBe(true);
    expect(picker.sessionListHost.isVisible()).toBeTruthy();
    expect(picker.sessionList.getItems()[0]).toBe(newSession);
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened"]);
  });

  it("abandons the flow when no kernel spec matches the grammar", async () => {
    await picker.toggle(() => false);
    await confirmItem(picker.gatewayList, "tokened");

    expect(picker.sessionListHost.isVisible()).toBeFalsy();
    expect(lumine.workspace.getModalTrail()).toEqual([]);
  });

  it("offers every remote language when a notebook adapter opened the picker", async () => {
    picker.fetchSpecs.and.returnValue(
      Promise.resolve({
        kernelspecs: {
          python3: { name: "python3", display_name: "Python 3", language: "python" },
          ir: { name: "ir", display_name: "R", language: "R" },
        },
      }),
    );
    const context = {
      adapter: {},
      filePath: "C:\\work\\notebook.ipynb",
      grammar: { name: "Python", scopeName: "source.python" },
    };

    await picker.toggle(null, context);
    await confirmItem(picker.gatewayList, "tokened");

    const newSession = picker.sessionList.getItems()[0];
    expect(newSession.kernelSpecs.map((spec) => spec.name)).toEqual(["python3", "ir"]);
  });

  it("carries the opening context and kernel_info language through a remote choice", async () => {
    picker.destroy();
    const chosen = jasmine.createSpy("chosen");
    picker = new WSKernelPicker(chosen);
    const languageInfo = { name: "R", version: "4.5" };
    const kernelSpec = { name: "ir", display_name: "R", language: "R" };
    const signal = { connect: () => {} };
    const session = {
      dispose: () => {},
      kernel: {
        ready: Promise.resolve(),
        spec: Promise.resolve(kernelSpec),
        status: "idle",
        statusChanged: signal,
        connectionStatusChanged: signal,
        iopubMessage: signal,
        requestKernelInfo: jasmine
          .createSpy("requestKernelInfo")
          .and.resolveTo({ content: { language_info: languageInfo } }),
      },
    };
    const rGrammar = { name: "R", scopeName: "source.r" };
    const context = {
      adapter: { getKernelGrammar: () => rGrammar },
      grammar: { name: "Python", scopeName: "source.python" },
    };
    const flow = picker._beginFlow(null, context);
    flow.gatewayName = "test";
    flow.committing = true;

    await picker.onSessionChosen(session, {}, flow, false);

    expect(session.kernel.requestKernelInfo).toHaveBeenCalled();
    expect(chosen).toHaveBeenCalled();
    const [transport, chosenContext] = chosen.calls.mostRecent().args;
    expect(transport.languageInfo).toEqual(languageInfo);
    expect(transport.language).toBe("r");
    expect(transport.grammar).toBe(rGrammar);
    expect(transport.ownsKernelProcess).toBe(false);
    expect(chosenContext).toBe(context);
  });

  it("falls back to the kernelspec when a ready remote kernel never answers kernel_info", async () => {
    picker.destroy();
    const chosen = jasmine.createSpy("chosen");
    picker = new WSKernelPicker(chosen);
    const signal = { connect: () => {} };
    const session = {
      dispose: () => {},
      kernel: {
        ready: Promise.resolve(),
        spec: Promise.resolve({
          name: "python3",
          display_name: "Python 3",
          language: "python",
        }),
        status: "idle",
        statusChanged: signal,
        connectionStatusChanged: signal,
        iopubMessage: signal,
        requestKernelInfo: jasmine
          .createSpy("requestKernelInfo")
          .and.returnValue(new Promise(() => {})),
      },
    };
    const context = { grammar: { name: "Python", scopeName: "source.python" } };
    const flow = picker._beginFlow(null, context);
    flow.gatewayName = "test";
    flow.committing = true;

    const pending = picker.onSessionChosen(session, {}, flow, false);
    await Promise.resolve();
    await Promise.resolve();
    window.advanceClock(3000);
    await pending;

    const [transport] = chosen.calls.mostRecent().args;
    expect(transport.languageInfo).toBeNull();
    expect(transport.language).toBe("python");
    transport.destroy();
  });

  it("disconnects instead of binding when the captured ordinary editor was destroyed", async () => {
    picker.destroy();
    const chosen = jasmine.createSpy("chosen");
    picker = new WSKernelPicker(chosen);
    const signal = { connect: () => {} };
    const session = {
      dispose: jasmine.createSpy("dispose"),
      shutdown: jasmine.createSpy("shutdown"),
      kernel: {
        ready: Promise.resolve(),
        spec: Promise.resolve({ name: "python3", display_name: "Python 3", language: "python" }),
        status: "idle",
        statusChanged: signal,
        connectionStatusChanged: signal,
        iopubMessage: signal,
        requestKernelInfo: jasmine.createSpy("requestKernelInfo"),
      },
    };
    const context = {
      editor: { isDestroyed: () => true },
      grammar: { name: "Python", scopeName: "source.python" },
    };
    const flow = picker._beginFlow(null, context);
    flow.gatewayName = "test";
    flow.committing = true;

    await picker.onSessionChosen(session, {}, flow, false);

    expect(chosen).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalled();
    expect(session.shutdown).not.toHaveBeenCalled();
  });

  it("lets adapter binding refresh after the captured split editor was destroyed", async () => {
    picker.destroy();
    const chosen = jasmine.createSpy("chosen");
    picker = new WSKernelPicker(chosen);
    const signal = { connect: () => {} };
    const session = {
      dispose: jasmine.createSpy("dispose"),
      kernel: {
        ready: Promise.resolve(),
        spec: Promise.resolve({ name: "python3", display_name: "Python 3", language: "python" }),
        status: "idle",
        statusChanged: signal,
        connectionStatusChanged: signal,
        iopubMessage: signal,
        requestKernelInfo: jasmine.createSpy("requestKernelInfo").and.resolveTo({
          content: { language_info: { name: "python" } },
        }),
      },
    };
    const grammar = { name: "Python", scopeName: "source.python" };
    const context = {
      adapter: { getKernelGrammar: () => grammar },
      owner: { isDestroyed: () => false },
      editor: { isDestroyed: () => true },
      grammar,
    };
    const flow = picker._beginFlow(null, context);
    flow.gatewayName = "test";
    flow.committing = true;

    await picker.onSessionChosen(session, {}, flow, false);

    expect(chosen).toHaveBeenCalled();
    expect(chosen.calls.mostRecent().args[1]).toBe(context);
    expect(session.dispose).not.toHaveBeenCalled();
    chosen.calls.mostRecent().args[0].destroy();
  });

  for (const [label, ownsKernelProcess] of [
    ["disconnects a stale attached session", false],
    ["shuts down a stale session it created", true],
  ]) {
    it(label, async () => {
      picker.destroy();
      const chosen = jasmine.createSpy("chosen");
      picker = new WSKernelPicker(chosen);
      const signal = { connect: () => {} };
      const session = {
        dispose: jasmine.createSpy("dispose"),
        shutdown: jasmine.createSpy("shutdown").and.resolveTo(),
        kernel: {
          ready: Promise.resolve(),
          spec: Promise.resolve({ name: "python3", display_name: "Python 3", language: "python" }),
          status: "idle",
          statusChanged: signal,
          connectionStatusChanged: signal,
          iopubMessage: signal,
          requestKernelInfo: jasmine.createSpy("requestKernelInfo").and.resolveTo({
            content: { language_info: { name: "python" } },
          }),
        },
      };
      const managers = {
        sessionManager: { dispose: jasmine.createSpy("dispose session manager") },
        kernelManager: { dispose: jasmine.createSpy("dispose kernel manager") },
      };
      const context = { grammar: { name: "Python", scopeName: "source.python" } };
      const staleFlow = picker._beginFlow(null, context);
      staleFlow.gatewayName = "test";
      const pending = picker.onSessionChosen(session, managers, staleFlow, ownsKernelProcess);
      picker._beginFlow(null, { grammar: context.grammar });

      await pending;

      expect(chosen).not.toHaveBeenCalled();
      expect(session.dispose).toHaveBeenCalled();
      expect(session.shutdown).toHaveBeenCalledTimes(ownsKernelProcess ? 1 : 0);
      expect(managers.sessionManager.dispose).toHaveBeenCalled();
      expect(managers.kernelManager.dispose).toHaveBeenCalled();
    });
  }
});
