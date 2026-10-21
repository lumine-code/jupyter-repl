const blocks = require("../../lib/source-analysis/blocks");

exports.inspectBlocks = (context, { rows, tabLength, language, syntax = true }) => {
  const foldQueries = [];
  const editor = {
    ...context,
    indentationForBufferRow: (row) => context.indentationForBufferRow(row, tabLength),
    getFoldableRangeAtBufferRow: (row) => {
      foldQueries.push(row);
      return context.getFoldableRangeAtBufferRow(row, tabLength);
    },
    getSyntaxNodeAtBufferPosition: syntax ? context.getSyntaxNodeAtBufferPosition : () => null,
  };
  return {
    blocks: rows.map((row) =>
      blocks.findCodeBlockAtRow(editor, row, { kernel: language ? { language } : null }),
    ),
    foldQueries,
  };
};
