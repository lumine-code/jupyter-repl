const fs = require("fs");
const path = require("path");

const Config = {
  getJson(key, _default = {}) {
    if (key === "gateways") {
      return this.getGateways(Array.isArray(_default) ? _default : []);
    }

    const value = lumine.config.get(`jupyter-repl.${key}`);
    if (!value || typeof value !== "string") {
      return _default;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      const message = `Your Jupyter config is broken: ${key}`;
      lumine.notifications.addError(message, {
        detail: error,
      });
    }

    return _default;
  },

  getGatewaysPath() {
    return path.join(lumine.getConfigDirPath(), "gateways.json");
  },

  openGateways() {
    const gatewaysPath = this.getGatewaysPath();
    this.ensureGatewaysFile(gatewaysPath);
    return lumine.workspace.open(gatewaysPath);
  },

  getGateways(_default = []) {
    const gatewaysPath = this.getGatewaysPath();
    this.ensureGatewaysFile(gatewaysPath);

    try {
      const gateways = JSON.parse(fs.readFileSync(gatewaysPath, "utf8"));
      if (!Array.isArray(gateways)) {
        throw new Error("Expected gateways.json to contain an array of gateway objects");
      }
      return gateways || _default;
    } catch (error) {
      lumine.notifications.addError("Your Jupyter gateways config is broken", {
        detail: error.message || String(error),
        dismissable: true,
      });
    }

    return _default;
  },

  ensureGatewaysFile(gatewaysPath) {
    if (fs.existsSync(gatewaysPath)) {
      return;
    }

    let contents = "[]\n";
    const oldValue = lumine.config.get("jupyter-repl.gateways");
    let migratedOldSetting = false;

    if (oldValue && typeof oldValue === "string") {
      try {
        contents = `${JSON.stringify(JSON.parse(oldValue), null, 2)}\n`;
        migratedOldSetting = true;
      } catch (error) {
        lumine.notifications.addWarning("Could not migrate Jupyter gateways setting", {
          detail: error.message || String(error),
          dismissable: true,
        });
      }
    }

    fs.mkdirSync(path.dirname(gatewaysPath), { recursive: true });
    fs.writeFileSync(gatewaysPath, contents);

    if (migratedOldSetting) {
      lumine.config.unset("jupyter-repl.gateways");
    }
  },
};

module.exports = Config;
