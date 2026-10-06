const { Emitter } = require("lumine");
const { isTextOutputOnly } = require("../../output-media");
const { isSingleLine } = require("../../output-utils");

// Presentation belongs to the surface displaying the data. Two result views
// can share an OutputStore while having different widths and line positions.
class OutputLayout {
  position = { lineHeight: 0, lineLength: 0, editorWidth: 0, charWidth: 0 };
  destroyed = false;

  constructor(store) {
    this.store = store;
    this.emitter = new Emitter();
  }

  onDidUpdate(callback) {
    return this.emitter.on("did-update", callback);
  }

  updatePosition(position) {
    if (this.destroyed) return false;
    let changed = false;
    for (const key of Object.keys(position)) {
      if (this.position[key] !== position[key]) {
        this.position[key] = position[key];
        changed = true;
      }
    }
    if (changed) this.emitter.emit("did-update");
    return changed;
  }

  setStore(store) {
    if (this.destroyed || store === this.store) return;
    this.store = store;
    this.emitter.emit("did-update");
  }

  get isPlain() {
    const outputs = this.store?.outputs || [];
    if (this.destroyed || outputs.length !== 1) return false;
    const availableSpace = Math.floor(
      (this.position.editorWidth - this.position.lineLength) / this.position.charWidth,
    );
    if (!Number.isFinite(availableSpace) || availableSpace <= 0) return false;
    const output = outputs[0];
    switch (output.output_type) {
      case "execute_result":
      case "display_data": {
        const bundle = output.data;
        return Boolean(
          bundle && isTextOutputOnly(bundle) && isSingleLine(bundle["text/plain"], availableSpace),
        );
      }
      case "stream":
        return isSingleLine(output.text, availableSpace);
      default:
        return false;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.store = null;
    this.emitter.dispose();
  }
}

module.exports = OutputLayout;
