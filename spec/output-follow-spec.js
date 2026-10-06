const etch = require("@lumine-code/etch");
const OutputStore = require("../lib/store/output");
const ResultViewComponent = require("../lib/components/result-view/result-view");
const ScrollList = require("../lib/components/result-view/list");

function stream(text) {
  return { output_type: "stream", name: "stdout", text };
}

function setAutoScroll(value) {
  const getConfig = lumine.config.get.bind(lumine.config);
  spyOn(lumine.config, "get").and.callFake((keyPath, ...args) =>
    keyPath === "jupyter-repl.autoScroll" ? value : getConfig(keyPath, ...args),
  );
}

function setScrollMetrics(element) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 200, writable: true },
    scrollTop: { configurable: true, value: 0, writable: true },
  });
}

for (const surface of ["result bubble", "dock output"]) {
  describe(`following output in the ${surface}`, () => {
    let component, scroller, appendOutput, afterRender;

    beforeEach(() => {
      if (surface === "result bubble") {
        const store = new OutputStore();
        store.appendOutput(stream("first\n"));
        component = new ResultViewComponent({ store, editor: null, showResult: true });
        scroller = component.refs.display;
        appendOutput = () => store.appendOutput(stream("next\n"));
        afterRender = () => component.afterRender();
      } else {
        const outputs = [stream("first\n")];
        component = new ScrollList({ outputs });
        scroller = component.element;
        appendOutput = () => {
          outputs.push(stream("next\n"));
          component.update({ outputs });
        };
        afterRender = () => component.readAfterUpdate();
      }
      setScrollMetrics(scroller);
    });

    afterEach(() => {
      component?.destroy();
      component = null;
    });

    function renderOutput(height) {
      appendOutput();
      scroller.scrollHeight = height;
      etch.updateSync(component);
      // The spec runner freezes the frame clock, so run the layout hook
      // explicitly, as the result-view specs do.
      afterRender();
    }

    function scrollTo(top) {
      scroller.scrollTop = top;
      scroller.dispatchEvent(new Event("scroll"));
    }

    it("follows appended output, pauses while reading earlier output, and resumes at the bottom", () => {
      setAutoScroll(true);
      afterRender();
      expect(scroller.scrollTop).toBe(100);

      renderOutput(300);
      expect(scroller.scrollTop).toBe(200);

      scrollTo(25);
      renderOutput(400);
      expect(scroller.scrollTop).toBe(25);
      renderOutput(500);
      expect(scroller.scrollTop).toBe(25);

      scrollTo(400);
      renderOutput(600);
      expect(scroller.scrollTop).toBe(500);
    });

    it("treats a fractional bottom offset as following", () => {
      setAutoScroll(true);
      scrollTo(99.5);

      renderOutput(300);

      expect(scroller.scrollTop).toBe(200);
    });

    it("keeps following when an asynchronous result grows before a queued follow scroll arrives", () => {
      setAutoScroll(true);
      afterRender();
      expect(scroller.scrollTop).toBe(100);

      // An embedded widget or iframe grows outside the output patch, before
      // the browser delivers the scroll event queued by that patch.
      scroller.scrollHeight = 300;
      scroller.dispatchEvent(new Event("scroll"));
      renderOutput(400);

      expect(scroller.scrollTop).toBe(300);
    });

    it("recognizes the latest offset when several follow writes share one scroll event", () => {
      setAutoScroll(true);
      afterRender();
      renderOutput(300);
      renderOutput(400);
      expect(scroller.scrollTop).toBe(300);

      scroller.scrollHeight = 500;
      scroller.dispatchEvent(new Event("scroll"));
      renderOutput(600);

      expect(scroller.scrollTop).toBe(500);
    });

    it("pauses for a user scroll before the queued follow event and resumes at the bottom", () => {
      setAutoScroll(true);
      afterRender();
      scroller.scrollHeight = 300;

      // The queued event now observes the user's offset rather than the
      // commanded one, so it must pause even though a follow write is pending.
      scrollTo(50);
      renderOutput(400);
      expect(scroller.scrollTop).toBe(50);

      scrollTo(300);
      renderOutput(500);
      expect(scroller.scrollTop).toBe(400);
    });

    it("preserves the scroll position when autoscroll is disabled", () => {
      setAutoScroll(false);
      scrollTo(100);

      renderOutput(300);

      expect(scroller.scrollTop).toBe(100);
    });

    it("removes the scroll listener when destroyed", () => {
      const remove = spyOn(scroller, "removeEventListener").and.callThrough();
      const listener = component.outputScroll.onScroll;

      component.destroy();
      component = null;

      expect(remove).toHaveBeenCalledWith("scroll", listener);
    });
  });
}
