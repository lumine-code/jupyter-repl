const store = require("./store");

function buildJupyterCommand() {
  const kernel = store.kernel;
  if (!kernel) {
    lumine.notifications.addError("jupyter-repl", {
      description: "No running kernel for the active editor.",
      dismissable: true,
    });
    return null;
  }

  const connectionFile = kernel.transport && kernel.transport.connectionFile;
  if (!connectionFile) {
    lumine.notifications.addError("jupyter-repl", {
      description:
        "Active kernel has no local connection file. Console launch is only supported for local kernels.",
      dismissable: true,
    });
    return null;
  }

  let template =
    lumine.config.get("jupyter-repl.jupyterCommand") ||
    '"{python}" -m jupyter_console --existing {connection-file}';

  // Resolve {python} to the kernel's own interpreter (kernelSpec.argv[0]) so
  // the console connects without the env being activated in the terminal. Fall
  // back to `python` from PATH when no local interpreter path is available.
  if (template.includes("{python}")) {
    const python =
      (kernel.kernelSpec && kernel.kernelSpec.argv && kernel.kernelSpec.argv[0]) || "python";
    template = template.split("{python}").join(python);
  }

  const quotedPath = `"${connectionFile}"`;
  if (template.includes("{connection-file}")) {
    return template.split("{connection-file}").join(quotedPath);
  }
  return `${template} ${quotedPath}`;
}

async function openJupyterConsole(terminalService) {
  if (!terminalService) {
    lumine.notifications.addError("jupyter-repl", {
      description: "No terminal service available. Install the `terminal` package.",
      dismissable: true,
    });
    return;
  }

  const command = buildJupyterCommand();
  if (!command) return;

  await terminalService.run([command]);
}

function copyJupyterConsoleCommand() {
  const command = buildJupyterCommand();
  if (!command) return;

  lumine.clipboard.write(command);
  lumine.notifications.addSuccess("jupyter-repl", {
    description: "Jupyter console command copied to clipboard.",
    detail: command,
  });
}

function spawnJupyterConsole(terminalSpawnService) {
  if (!terminalSpawnService) {
    lumine.notifications.addError("jupyter-repl", {
      description: "No terminal-spawn service available. Install the `terminal-spawn` package.",
      dismissable: true,
    });
    return;
  }

  const command = buildJupyterCommand();
  if (!command) return;

  terminalSpawnService.open(store.filePath, command);
}

module.exports = {
  copyJupyterConsoleCommand,
  spawnJupyterConsole,
  openJupyterConsole,
};
