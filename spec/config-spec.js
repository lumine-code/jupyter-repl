const fs = require("fs");
const os = require("os");
const path = require("path");
const Config = require("../lib/config");

// These specs cover the migration away from the `season`/CSON gateways file.
// The old code required `season` from the editor resourcePath (now scoped to
// @lumine-code/season, so the bare path no longer resolves) purely to read and
// write a CSON gateways file. Gateways are now stored as plain JSON.
describe("jupyter-repl gateways config", () => {
  let configDir;

  beforeEach(() => {
    configDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "jupyter-repl-config-")));
    spyOn(lumine, "getConfigDirPath").andReturn(configDir);
  });

  afterEach(() => {
    // Retries because Windows keeps a directory non-empty until the last handle on a child
    // closes, and `force` swallows only ENOENT.
    fs.rmSync(configDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("stores the gateways file as JSON", () => {
    expect(Config.getGatewaysPath()).toBe(path.join(configDir, "gateways.json"));
  });

  it("creates an empty gateways.json on first use", () => {
    const gatewaysPath = Config.getGatewaysPath();
    expect(fs.existsSync(gatewaysPath)).toBe(false);

    Config.ensureGatewaysFile(gatewaysPath);

    expect(fs.existsSync(gatewaysPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(gatewaysPath, "utf8"))).toEqual([]);
  });

  it("reads gateway objects from gateways.json", () => {
    const gateways = [{ name: "Local", baseUrl: "http://localhost:8888", token: "abc" }];
    fs.writeFileSync(Config.getGatewaysPath(), JSON.stringify(gateways));

    expect(Config.getGateways()).toEqual(gateways);
    expect(Config.getJson("gateways")).toEqual(gateways);
  });

  it("migrates the legacy gateways string setting into gateways.json", () => {
    const legacy = [{ name: "Legacy", baseUrl: "http://example.com" }];
    spyOn(lumine.config, "get").andCallFake((key) =>
      key === "jupyter-repl.gateways" ? JSON.stringify(legacy) : undefined,
    );
    spyOn(lumine.config, "unset");

    Config.ensureGatewaysFile(Config.getGatewaysPath());

    expect(JSON.parse(fs.readFileSync(Config.getGatewaysPath(), "utf8"))).toEqual(legacy);
    expect(lumine.config.unset).toHaveBeenCalledWith("jupyter-repl.gateways");
  });

  it("reports an error and returns the default when gateways.json is broken", () => {
    fs.writeFileSync(Config.getGatewaysPath(), "{ not valid json ");
    spyOn(lumine.notifications, "addError");

    expect(Config.getGateways(["fallback"])).toEqual(["fallback"]);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("rejects a gateways.json that is not an array", () => {
    fs.writeFileSync(Config.getGatewaysPath(), JSON.stringify({ not: "an array" }));
    spyOn(lumine.notifications, "addError");

    expect(Config.getGateways([])).toEqual([]);
    expect(lumine.notifications.addError).toHaveBeenCalled();
  });

  it("loads config without the removed season module", () => {
    // Regression guard: importing and exercising config.js must not throw the
    // way the old `require(<resourcePath>/node_modules/season)` did in Lumine.
    expect(() => Config.getGateways()).not.toThrow();
  });
});
