// Keep following a growing result until the user scrolls back to read it.
// A scroll event observes the user's position before the next output patch;
// measuring only after the patch would mistake new content for scrolling up.
class OutputScroll {
  constructor() {
    this.element = null;
    this.following = true;
  }

  onScroll = () => {
    const { scrollTop, scrollHeight, clientHeight } = this.element;
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
    this.element.scrollTop = Math.max(0, scrollHeight - clientHeight);
  }

  destroy() {
    this.element?.removeEventListener("scroll", this.onScroll);
    this.element = null;
  }
}

module.exports = OutputScroll;
