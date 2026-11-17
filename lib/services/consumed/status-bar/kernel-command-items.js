const interrupt = { name: "Interrupt Kernel", command: "interrupt-kernel" };
const restart = { name: "Restart Kernel", command: "restart-kernel" };
const shutdown = { name: "Shut Down Kernel", command: "shutdown-kernel" };
const rename = { name: "Rename Session…", command: "rename-kernel" };
const disconnect = { name: "Disconnect Remote Session", command: "disconnect-kernel" };
const consoleItems = [
  { name: "Open Jupyter Console in Terminal", command: "open-jupyter-console" },
  { name: "Spawn Jupyter Console Terminal", command: "spawn-jupyter-console" },
  { name: "Copy Console Command", command: "copy-console-command" },
];

module.exports = function kernelCommandItems(kernel, { includeCopy = false } = {}) {
  if (!kernel) return [];
  const lifecycle = kernel.transport?.lifecycle ?? kernel.executionState;
  const canDisconnect =
    kernel.transport?.ownsKernelProcess === false && lifecycle !== "shutting-down";
  const canRestart = kernel.transport?.canRestart;
  if (lifecycle === "dead" && !canRestart) return canDisconnect ? [disconnect] : [];

  const recovery = canRestart === false ? [shutdown] : [restart, shutdown];
  if (
    ["loading", "recovering", "unresponsive", "restarting", "shutting-down", "dead"].includes(
      lifecycle,
    )
  ) {
    if (canDisconnect) recovery.push(disconnect);
    return recovery;
  }
  const commands = [interrupt, ...recovery];
  if (kernel.transport instanceof require("../../../ws-kernel")) commands.push(rename);
  if (canDisconnect) commands.push(disconnect);
  commands.push(
    ...consoleItems.filter((item) => includeCopy || item.command !== "copy-console-command"),
  );
  return commands;
};
