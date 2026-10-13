const basic = [
  { name: "Interrupt Kernel", command: "interrupt-kernel" },
  { name: "Restart Kernel", command: "restart-kernel" },
  { name: "Shut Down Kernel", command: "shutdown-kernel" },
];
const remote = [
  { name: "Rename Session", command: "rename-kernel" },
  { name: "Disconnect Kernel", command: "disconnect-kernel" },
];
const consoleItems = [
  { name: "Open Jupyter Console in Terminal", command: "open-jupyter-console" },
  { name: "Spawn Jupyter Console Terminal", command: "spawn-jupyter-console" },
  { name: "Copy Console Command", command: "copy-console-command" },
];

module.exports = function kernelCommandItems(kernel, { includeCopy = false } = {}) {
  if (!kernel) return [];
  const lifecycle = kernel.transport?.lifecycle ?? kernel.executionState;
  if (["loading", "recovering", "unresponsive", "restarting", "shutting-down"].includes(lifecycle))
    return basic.slice(1);
  const commands = [...basic];
  if (kernel.transport instanceof require("../../../ws-kernel")) commands.push(...remote);
  commands.push(
    ...consoleItems.filter((item) => includeCopy || item.command !== "copy-console-command"),
  );
  return commands;
};
module.exports.items = [...basic, ...remote, ...consoleItems];
