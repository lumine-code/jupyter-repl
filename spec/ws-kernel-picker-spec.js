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

  it("opens the gateway list", async () => {
    await picker.toggle(() => true);
    expect(picker.gatewayList.isVisible()).toBeTruthy();
    expect(picker.gatewayList.props.items.map((item) => item.name)).toEqual(["local", "tokened"]);
  });

  it("asks for an authentication method when the gateway has no token", async () => {
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[0]);

    expect(picker.authList.isVisible()).toBeTruthy();
    expect(picker.authList.props.infoMessage).toBe("Authenticate with local");
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication"]);
  });

  it("prompts for a masked token and reaches the gateway's sessions", async () => {
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[0]);
    await picker.onAuthMethod("token");

    expect(picker.credentialDialog.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication", "Token"]);
    picker.credentialDialog.getQueryEditor().setText("secret");
    expect(picker.credentialDialog.getQueryEditor().element.style.webkitTextSecurity).toBe("disc");

    await picker.onCredential("secret");

    expect(picker._gatewayOptions.token).toBe("secret");
    expect(picker.sessionList.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual([
      "Gateways",
      "Authentication",
      "Token",
      "local",
    ]);
    expect(picker.sessionList.props.items.map((item) => item.name)).toEqual(["[new session]"]);
  });

  it("skips the authentication steps for a preconfigured token", async () => {
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[1]);

    expect(picker.sessionList.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened"]);
  });

  it("keeps an empty credential in the dialog with an error message", async () => {
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[0]);
    await picker.onAuthMethod("token");

    await picker.onCredential("");

    expect(picker.credentialDialog.isVisible()).toBeTruthy();
    expect(picker.credentialDialog.props.status).toEqual({
      type: "error",
      message: "Enter a token.",
    });
    expect(picker.credentialDialog.element.textContent).toContain("Enter a token.");
    expect(picker.sessionList.isVisible()).toBeFalsy();
  });

  it("backs up one step to retry after an authentication failure", async () => {
    picker.fetchSpecs.and.callFake(() => Promise.reject({ response: { status: 401 } }));
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[0]);
    await picker.onAuthMethod("token");
    await picker.onCredential("wrong");

    expect(picker.sessionList.isVisible()).toBeFalsy();
    expect(picker.credentialDialog.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "Authentication", "Token"]);
  });

  it("lists kernel specs for a new session and navigates back to the sessions", async () => {
    await picker.toggle(() => true);
    await picker.onGateway(GATEWAYS[1]);

    const newSession = picker.sessionList.props.items[0];
    await picker.showSpecList(newSession);

    expect(picker.specList.isVisible()).toBeTruthy();
    expect(picker.specList.props.infoMessage).toBe("Select a kernel spec");
    expect(picker.specList.props.items.map((item) => item.name)).toEqual(["Python 3"]);
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened", "New session"]);

    expect(lumine.workspace.popModal()).toBe(true);
    expect(picker.sessionList.isVisible()).toBeTruthy();
    expect(picker.sessionList.props.items[0]).toBe(newSession);
    expect(lumine.workspace.getModalTrail()).toEqual(["Gateways", "tokened"]);
  });

  it("abandons the flow when no kernel spec matches the grammar", async () => {
    await picker.toggle(() => false);
    await picker.onGateway(GATEWAYS[1]);

    expect(picker.sessionList.isVisible()).toBeFalsy();
    expect(lumine.workspace.getModalTrail()).toEqual([]);
  });
});
