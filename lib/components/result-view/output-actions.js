const path = require("path");

// The copy, save and open-in-editor actions a result offers. Split out of the
// view so it renders and these read the rendered DOM, and because all three
// shared one canvas conversion that was written out three times.

/** The image a result is showing, as img, canvas or plot SVG. */
function getImage(element) {
  if (!element) {
    return null;
  }
  const img = element.querySelector("img");
  if (img) {
    return img;
  }
  const canvas = element.querySelector("canvas");
  if (canvas) {
    return canvas;
  }
  // A plot's SVG, not LaTeX's.
  return element.querySelector(".output-svg svg");
}

function getAllText(element) {
  if (!element) {
    return "";
  }
  return element.innerText ? element.innerText : "";
}

/** Whether any output holds something worth offering a copy button for. */
function hasCopyableContent(outputs) {
  return outputs.some((output) => {
    if (output.output_type === "stream") return true;
    if (output.output_type === "error") return true;
    if (output.data) {
      // LaTeX renders to SVG, so there is no text to copy.
      if (output.data["text/latex"]) return false;
      return Boolean(
        output.data["text/plain"] ||
        output.data["image/png"] ||
        output.data["image/jpeg"] ||
        output.data["image/gif"] ||
        output.data["image/svg+xml"],
      );
    }
    return false;
  });
}

/**
 * Draw whatever kind of image element this is onto a fresh canvas, which is
 * what every one of the actions below needs before it can encode a PNG.
 */
async function imageToCanvas(imageEl) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (imageEl.tagName === "CANVAS") {
    canvas.width = imageEl.width;
    canvas.height = imageEl.height;
    ctx.drawImage(imageEl, 0, 0);
    return canvas;
  }

  if (imageEl.tagName === "svg" || imageEl.tagName === "SVG") {
    const svgData = new XMLSerializer().serializeToString(imageEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      canvas.width = img.width || imageEl.clientWidth || 800;
      canvas.height = img.height || imageEl.clientHeight || 600;
      // An SVG has no background of its own, and the target is usually a
      // light document rather than the editor's theme.
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(url);
    }
    return canvas;
  }

  canvas.width = imageEl.naturalWidth || imageEl.width;
  canvas.height = imageEl.naturalHeight || imageEl.height;
  ctx.drawImage(imageEl, 0, 0);
  return canvas;
}

async function copyImageToClipboard(imageEl) {
  const canvas = await imageToCanvas(imageEl);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

async function copyToClipboard(element) {
  const imageEl = getImage(element);
  if (imageEl) {
    try {
      await copyImageToClipboard(imageEl);
      atom.notifications.addSuccess("Image copied to clipboard");
      return;
    } catch (err) {
      console.error("Failed to copy image:", err);
      // Fall through to the text copy.
    }
  }

  const text = getAllText(element);
  if (text) {
    atom.clipboard.write(text);
    atom.notifications.addSuccess("Copied to clipboard");
  } else {
    atom.notifications.addWarning("Nothing to copy");
  }
}

async function saveImage(element, editor) {
  const imageEl = getImage(element);
  if (!imageEl) {
    atom.notifications.addWarning("No image to save");
    return;
  }

  try {
    const canvas = await imageToCanvas(imageEl);

    const editorPath = editor && editor.getPath();
    const defaultDir = editorPath ? path.dirname(editorPath) : "";

    const result = await atom.window.showSaveDialog({
      defaultPath: defaultDir ? path.join(defaultDir, "image.png") : "image.png",
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });

    if (result.canceled || !result.filePath) {
      return;
    }

    const dataUrl = canvas.toDataURL("image/png");
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
    const { writeFile } = require("fs").promises;
    await writeFile(result.filePath, base64Data, "base64");

    atom.notifications.addSuccess("Image saved");
  } catch (err) {
    console.error("Failed to save image:", err);
    atom.notifications.addError("Failed to save image");
  }
}

async function openImageInEditor(imageEl) {
  const canvas = await imageToCanvas(imageEl);
  // A data URL, so the image opens without being written to disk first.
  const dataUrl = canvas.toDataURL("image/png");
  const { getImageEditorService } = require("../../main");
  const imageEditorService = getImageEditorService();
  if (imageEditorService && imageEditorService.openFromDataUrl) {
    imageEditorService.openFromDataUrl(dataUrl, "Jupyter Output");
  } else {
    atom.notifications.addWarning("image-editor package not available");
  }
}

async function openInEditor(element) {
  const imageEl = getImage(element);
  if (imageEl) {
    try {
      await openImageInEditor(imageEl);
      return;
    } catch (err) {
      console.error("Failed to open image in editor:", err);
      // Fall through to the text.
    }
  }

  const text = getAllText(element);
  if (text) {
    // An open can decline, e.g. when the workspace center is full.
    atom.workspace.open().then((editor) => editor?.insertText(text));
  }
}

/**
 * The output-area font size, as a CSS length. The setting is a pixel count and
 * zero means "whatever the editor uses"; a bare number is not a valid CSS
 * length, so it never applied until it carried its unit.
 *
 * @returns {String}
 */
function outputFontSize() {
  const size = atom.config.get("jupyter-repl.outputAreaFontSize");
  return size ? `${size}px` : "inherit";
}

module.exports = {
  outputFontSize,
  getImage,
  getAllText,
  hasCopyableContent,
  imageToCanvas,
  copyImageToClipboard,
  copyToClipboard,
  saveImage,
  openImageInEditor,
  openInEditor,
};
