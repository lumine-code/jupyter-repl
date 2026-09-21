// The cell service is part of the package-facing bootstrap contract, while the
// code manager itself is a large editor-operation module. Keep the tiny piece
// of shared state separate so consuming `jupyter.cells` does not load that
// implementation during package activation.
let cellsService = null;

function setCellsService(service) {
  cellsService = service;
}

function getCellsService() {
  return cellsService;
}

module.exports = { getCellsService, setCellsService };
