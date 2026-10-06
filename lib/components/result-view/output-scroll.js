// Keep following a growing result until the user scrolls back to read it.
// A scroll event observes the user's position before the next output patch;
// measuring only after the patch would mistake new content for scrolling up.
class OutputScroll {
  constructor() {
    this.element = null;
    this.following = true;
    this.pendingScrollTop = null;
  }

  onScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = this.element;
    const commandedScroll = scrollTop === this.pendingScrollTop;
    this.pendingScrollTop = null;
    // Scroll events are queued. An image or widget can grow after our write
    // but before its event, leaving the commanded offset short of the new
    // bottom. That is still following, rather than the user scrolling back.
    if (commandedScroll) return;
    // scrollTop can be fractional while the height metrics are rounded.
    this.following = scrollHeight - clientHeight - scrollTop <= 1;
  };

  attach(element) {
    if (element === this.element) return;
    this.destroy();
    this.element = element;
    this.following = true;
    element?.addEventListener("scroll", this.onScroll, { passive: true });
  }

  scrollToBottom(scrollHeight, clientHeight) {
    if (
      !this.element ||
      !this.following ||
      lumine.config.get("jupyter-repl.autoScroll") === false
    ) {
      return;
    }
    const previous = this.element.scrollTop;
    const target = Math.max(0, scrollHeight - clientHeight);
    // An equal-position write queues no event, so it must not leave a marker
    // that could consume an unrelated scroll later. Keep any previous marker
    // until its already-queued event arrives.
    if (target === previous) return;
    this.element.scrollTop = target;
    const actual = this.element.scrollTop;
    // The browser may clamp the write; only an effective change has an event.
    // Several writes can share one event, which reads their latest offset.
    if (actual !== previous) this.pendingScrollTop = actual;
  }

  destroy() {
    this.element?.removeEventListener("scroll", this.onScroll);
    this.element = null;
    this.pendingScrollTop = null;
  }
}

module.exports = OutputScroll;
