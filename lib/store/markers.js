class MarkerStore {
  markers = new Map();
  // Bubbles indexed by their marker's current row. clearOnRow runs once per
  // created result, so scanning every live bubble there made a long batch
  // quadratic — 3000 inline results cost 4.5 million marker-range reads. The
  // markers are point markers (markBufferPosition), so one row per bubble is
  // the whole truth; ResultView reports moves through rowChanged.
  bubblesByRow = new Map();

  clear() {
    this.markers.forEach((bubble) => {
      if (!bubble.destroyed) bubble.destroy();
    });
    this.markers.clear();
    this.bubblesByRow.clear();
  }

  clearOnRow(row) {
    let destroyed = false;
    const bubbles = this.bubblesByRow.get(row);
    if (bubbles) {
      for (const bubble of [...bubbles]) {
        if (!bubble.destroyed) destroyed = true;
        this.delete(bubble.marker.id);
      }
    }
    return destroyed;
  }

  new(bubble) {
    this.markers.set(bubble.marker.id, bubble);
    this._indexRow(bubble, bubble.marker.getStartBufferPosition().row);
  }

  // Called by the bubble whenever its marker's position changes, so the row
  // index follows edits above the bubble.
  rowChanged(bubble) {
    const row = bubble.marker.getStartBufferPosition().row;
    if (row === bubble._markerStoreRow) return;
    this._unindexRow(bubble);
    this._indexRow(bubble, row);
  }

  delete(key) {
    const bubble = this.markers.get(key);
    if (bubble) {
      this._unindexRow(bubble);
      if (!bubble.destroyed) bubble.destroy();
    }
    this.markers.delete(key);
  }

  _indexRow(bubble, row) {
    bubble._markerStoreRow = row;
    let set = this.bubblesByRow.get(row);
    if (!set) {
      set = new Set();
      this.bubblesByRow.set(row, set);
    }
    set.add(bubble);
  }

  _unindexRow(bubble) {
    const set = this.bubblesByRow.get(bubble._markerStoreRow);
    if (set) {
      set.delete(bubble);
      if (set.size === 0) this.bubblesByRow.delete(bubble._markerStoreRow);
    }
  }
}

module.exports = MarkerStore;
