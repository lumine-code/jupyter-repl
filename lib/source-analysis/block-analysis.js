const { Point, Range } = require("lumine");
const blocks = require("./blocks");

function inputs(context, { tabLength, language, cell }) {
  return {
    editor: {
      ...context,
      indentationForBufferRow: (row) => context.indentationForBufferRow(row, tabLength),
      getFoldableRangeAtBufferRow: (row) => context.getFoldableRangeAtBufferRow(row, tabLength),
    },
    options: {
      kernel: language ? { language } : null,
      cellsService: cell ? { getCell: () => Range.fromObject(cell) } : null,
    },
  };
}

exports.block = function (context, params) {
  const { editor, options } = inputs(context, params);
  if (params.method === "getFoldRange") return blocks.getFoldRange(editor, params.row);
  if (params.method === "getFoldContents") return blocks.getFoldContents(editor, params.row);
  if (params.method === "findPrecedingBlock")
    return blocks.findPrecedingBlock(editor, params.row, params.indentLevel, options);
  if (params.method === "findCodeBlockAtRow")
    return blocks.findCodeBlockAtRow(editor, params.row, options);
  if (params.method === "findCodeBlock") {
    const range = Range.fromObject(params.range);
    const cursor = Point.fromObject(params.cursor);
    return blocks.findCodeBlock(
      editor,
      {
        isEmpty: () => range.isEmpty(),
        getBufferRange: () => range,
        cursor: { getBufferRow: () => cursor.row },
      },
      options,
    );
  }
  throw new Error(`Unknown source block analysis: ${params.method}`);
};

exports.range = async function (context, params, { signal, emit }) {
  const { editor, options } = inputs(context, params);
  let row = params.first,
    count = 0;
  const packet = [];
  while (row <= params.last) {
    signal.throwIfAborted();
    if (context.buffer.isRowBlank(row)) {
      row++;
      continue;
    }
    const block = blocks.findCodeBlockAtRow(editor, row, options);
    if (block?.row > params.last) break;
    if (block) {
      packet.push(block);
      count++;
    }
    row = Math.max(row + 1, (block?.row ?? row) + 1);
    if (packet.length >= 128) {
      await emit(packet);
      packet.length = 0;
    }
  }
  if (packet.length) await emit(packet);
  return { count };
};
