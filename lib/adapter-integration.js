const store = require("./store");
const AdapterDocumentRegistry = require("./adapter-document-registry");
const AdapterKernelBinding = require("./adapter-kernel-binding");
const AdapterTargetExecution = require("./adapter-target-execution");

let binding, execution;
const documents = new AdapterDocumentRegistry({
  store,
  workspace: () => lumine.workspace,
  getKernelGrammar: (adapter, kernelSpec) => binding.getAdapterKernelGrammar(adapter, kernelSpec),
  onDocumentClosed: ({ adapter, key, kernel }) => {
    execution.cancelAdapterTargets(adapter, null, "notebook closed");
    store.removeKernelKey(key);
    if (kernel && store.getFilesForKernel(kernel).length === 0) binding.disposeUnboundKernel(kernel);
  },
});
binding = new AdapterKernelBinding({
  store,
  documents,
  hasRunningTargets: (owner) => execution.hasRunningTargets(owner),
  cancelTargets: (...args) => execution.cancelAdapterTargets(...args),
  notifications: () => lumine.notifications,
  autoPickerEnabled: () => lumine.config.get("jupyter-repl.autoKernelPicker"),
  plainTextGrammar: () =>
    lumine.grammars.grammarForScopeName("text.plain") || lumine.grammars.nullGrammar,
  loadKernelPicker: () => require("./kernel-picker"),
});
execution = new AdapterTargetExecution({
  store,
  documents,
  checkForKernel: (...args) => binding.checkForAdapterKernel(...args),
  getKernelForAdapter: (adapter) => binding.getKernelForAdapter(adapter),
  notifications: () => lumine.notifications,
});

function disposeAdapterIntegration() {
  // Invalidate contexts before picker/cancellation callbacks can resume work.
  documents.deactivate();
  binding.disposePicker();
  documents.disposeObservers();
  execution.cancelAll();
  binding.clearPending();
  execution.clearMarkers();
}

module.exports = {
  runAdapterTargets: execution.runAdapterTargets.bind(execution),
  startAdapterKernel: binding.startAdapterKernel.bind(binding),
  handleAdapterKernelCommand: binding.handleAdapterKernelCommand.bind(binding),
  clearAdapterResults: execution.clearAdapterResults.bind(execution),
  getAdapterFocusedEditor: execution.getAdapterFocusedEditor.bind(execution),
  captureAdapterKernelContext: documents.captureAdapterKernelContext.bind(documents),
  bindAdapterKernel: binding.bindAdapterKernel.bind(binding),
  canChangeAdapterKernel: binding.canChangeAdapterKernel.bind(binding),
  disposeAdapterIntegration,
  activateAdapterIntegration: documents.activate.bind(documents),
  getKernelForAdapter: binding.getKernelForAdapter.bind(binding),
  bindExistingAdapterKernel: binding.bindExistingAdapterKernel.bind(binding),
  runExplicitAdapterTarget: execution.runExplicitAdapterTarget.bind(execution),
};
