const path = require("path");
const { promises } = require("fs");
const { writeFile } = promises;

const { stringifyNotebook } = require("@nteract/commutable");

const store = require("./store");
async function exportNotebook() {
  const editor = lumine.workspace.getActiveTextEditor();
  const editorPath = editor.getPath();
  const directory = path.dirname(editorPath);
  const rawFileName = path.basename(editorPath, path.extname(editorPath));
  const noteBookPath = path.join(directory, `${rawFileName}.ipynb`);

  const { canceled, filePath } = await lumine.window.showSaveDialog({
    title: editor.getTitle(),
    defaultPath: noteBookPath,
  });
  if (!canceled) {
    await saveNoteBook(filePath);
  }
}

async function saveNoteBook(filePath) {
  if (filePath.length === 0) {
    return;
  }
  // add default extension
  const ext = path.extname(filePath) === "" ? ".ipynb" : "";
  const fname = `${filePath}${ext}`;

  try {
    await writeFile(fname, stringifyNotebook(store.notebook));
    lumine.notifications.addSuccess("Save successful", {
      detail: `Saved notebook as ${fname}`,
    });
  } catch (err) {
    lumine.notifications.addError("Error saving file", {
      detail: err.message,
    });
  }
}

module.exports = {
  exportNotebook,
};
