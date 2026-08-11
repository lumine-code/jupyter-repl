const registry = require("../lib/widget-registry");

// A widget-view output names a model id and nothing else, and there is no path
// from an output back to the kernel that produced it: an OutputStore holds no
// kernel, renderDisplay takes only the output, and one kernel serves every
// editor mapped to it. This index is what closes that gap, which is why it is
// dependency-free and safe to consult from the render path — the renderer must
// be able to ask whether a model is renderable before it commits to a media
// type, and it must do so without loading the widget bundle.

describe("the widget registry", () => {
  const managerA = { name: "a" };
  const managerB = { name: "b" };

  afterEach(() => {
    registry.releaseHost("kernel-1");
    registry.releaseHost("kernel-2");
    registry.releaseModelsOf(managerA);
    registry.releaseModelsOf(managerB);
  });

  it("answers with nothing for a model it has never seen", () => {
    expect(registry.managerForModelId("unknown")).toBe(null);
  });

  it("resolves a claimed model to its manager", () => {
    registry.claimModel("m1", managerA);

    expect(registry.managerForModelId("m1")).toBe(managerA);
  });

  it("keeps two managers' models apart", () => {
    registry.claimModel("m1", managerA);
    registry.claimModel("m2", managerB);

    expect(registry.managerForModelId("m1")).toBe(managerA);
    expect(registry.managerForModelId("m2")).toBe(managerB);
  });

  it("forgets a released model", () => {
    registry.claimModel("m1", managerA);
    registry.releaseModel("m1");

    expect(registry.managerForModelId("m1")).toBe(null);
  });

  it("releases every model of one manager and leaves the others", () => {
    // What a kernel restart does: that kernel's models are gone, and every
    // other kernel in the window is untouched.
    registry.claimModel("m1", managerA);
    registry.claimModel("m2", managerA);
    registry.claimModel("m3", managerB);

    registry.releaseModelsOf(managerA);

    expect(registry.managerForModelId("m1")).toBe(null);
    expect(registry.managerForModelId("m2")).toBe(null);
    expect(registry.managerForModelId("m3")).toBe(managerB);
  });

  describe("hosts", () => {
    it("resolves a registered host", () => {
      registry.registerHost("kernel-1", managerA);

      expect(registry.managerForHost("kernel-1")).toBe(managerA);
    });

    it("cannot tell a live kernel from a restored document", () => {
      // The whole point of keying on an opaque host id: nothing downstream —
      // not the renderer, not managerForModelId — needs to know which it has.
      registry.registerHost("kernel-1", managerA);
      registry.registerHost("nb:/tmp/a.ipynb", managerB);

      expect(registry.managerForHost("kernel-1")).toBe(managerA);
      expect(registry.managerForHost("nb:/tmp/a.ipynb")).toBe(managerB);

      registry.releaseHost("nb:/tmp/a.ipynb");
    });

    it("takes that host's models with it when it is released", () => {
      registry.registerHost("kernel-1", managerA);
      registry.claimModel("m1", managerA);

      registry.releaseHost("kernel-1");

      expect(registry.managerForHost("kernel-1")).toBe(null);
      expect(registry.managerForModelId("m1")).toBe(null);
    });
  });
});
