const { Point, Range } = require("lumine");
const codeManager = require("./code-manager");
const { headerAt, lastRow, intersectRanges } = require("./cell-magic");

async function cellServiceFor(editor, getService) {
  let service = getService();
  if (service?.getCellDescriptors && service?.getExecutionBlocks) return service;
  if (editor.getGrammar().scopeName !== "source.python.ipy") return null;
  await lumine.packages.requestService("jupyter.cells", "^1.0.0");
  service = getService();
  if (service?.getCellDescriptors && service?.getExecutionBlocks) return service;
  lumine.notifications.addWarning("Enable jupyter-cells to run a mixed IPython document.");
  return false;
}

async function stableCapture(editor, prepare) {
  if (!editor || editor.isDestroyed()) return [];
  const scope = editor.getGrammar().scopeName;
  let changed = false;
  const subscription = editor.getBuffer().onWillChange(() => {
    changed = true;
  });
  try {
    const blocks = await prepare();
    if (editor.isDestroyed()) return [];
    if (changed || editor.getGrammar().scopeName !== scope) {
      lumine.notifications.addWarning("Source changed while preparing execution. Run again.");
      return [];
    }
    return blocks;
  } finally {
    subscription.dispose();
  }
}

function selectionBlocks(editor, getService) {
  const selections = editor.getSelections().map((selection) => {
    const range = selection.getBufferRange().copy();
    const point = selection.cursor.getBufferPosition().copy();
    return {
      isEmpty: () => range.isEmpty(),
      getBufferRange: () => range,
      cursor: { getBufferPosition: () => point, getBufferRow: () => point.row },
    };
  });
  return stableCapture(editor, () => captureSelections(editor, getService, selections));
}

async function captureSelections(editor, getService, selections) {
  const cells = await cellServiceFor(editor, getService);
  if (cells === false || editor.isDestroyed()) return [];
  const blocks = [];
  for (const selection of selections) {
    if (!selection.isEmpty() && cells) {
      blocks.push(...(await cells.getExecutionBlocks(editor, selection.getBufferRange())));
      continue;
    }
    let cell;
    if (cells) {
      const point = selection.cursor.getBufferPosition();
      [cell] = await cells.getCellDescriptors(editor, new Range(point, point));
      if (cell?.range.isEmpty()) continue;
      if (cell && (cell.cellType !== "code" || headerAt(editor, cell.range))) {
        blocks.push(...(await cells.getExecutionBlocks(editor, cell.range)));
        continue;
      }
    }
    const block = codeManager.findCodeBlock(editor, selection);
    if (!block || !block.code) continue;
    if (cells && block.range) {
      const range = cell ? intersectRanges(block.range, cell.range) : block.range;
      if (range && !range.isEmpty())
        blocks.push(...(await cells.getExecutionBlocks(editor, range)));
    } else {
      blocks.push({ code: block.code, row: block.row, cellType: "code" });
    }
  }
  return blocks;
}

function inlineBlocks(editor, startRow, endRow, getService) {
  return stableCapture(editor, () => captureInline(editor, startRow, endRow, getService));
}

async function captureInline(editor, startRow, endRow, getService) {
  const cells = await cellServiceFor(editor, getService);
  if (cells === false || editor.isDestroyed()) return [];
  const buffer = editor.getBuffer();
  const scanRange = new Range([startRow, 0], buffer.clipPosition([endRow + 1, 0]));
  const descriptors = cells
    ? await cells.getCellDescriptors(editor, scanRange)
    : [{ range: scanRange, cellType: "code" }];
  const blocks = [];
  for (const cell of descriptors) {
    if (cell.range.isEmpty()) continue;
    const completeRange =
      cells?.getCell(editor, new Point(cell.range.start.row, 0)) || buffer.getRange();
    const magic = headerAt(editor, completeRange);
    if (cell.cellType !== "code" || magic) {
      if (cells) {
        blocks.push(...(await cells.getExecutionBlocks(editor, cell.range)));
      } else if (magic) {
        const body =
          intersectRanges(cell.range, new Range(magic.bodyStart, buffer.getEndPosition())) ||
          new Range(magic.bodyStart, magic.bodyStart);
        blocks.push({
          code: `${magic.header}\n${editor.getTextInBufferRange(body)}`,
          row: body.isEmpty() ? magic.row : lastRow(body),
          cellType: "code",
        });
      }
      continue;
    }
    let row = cell.range.start.row;
    const finalRow = lastRow(cell.range);
    while (row <= finalRow) {
      if (codeManager.isBlank(editor, row)) {
        row++;
        continue;
      }
      const block = codeManager.findCodeBlockAtRow(editor, row);
      if (block?.row > finalRow) break;
      const range = block?.range ? intersectRanges(block.range, completeRange) : null;
      if (range && !range.isEmpty() && block.code) {
        blocks.push({
          code: codeManager.normalizeString(editor.getTextInBufferRange(range)),
          row: lastRow(range),
          cellType: "code",
        });
        row = Math.max(row + 1, lastRow(range) + 1);
      } else {
        row++;
      }
    }
  }
  return blocks;
}

module.exports = { selectionBlocks, inlineBlocks };
