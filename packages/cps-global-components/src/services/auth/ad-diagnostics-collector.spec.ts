import { createAdDiagnosticsCollector } from "./ad-diagnostics-collector";

describe("createAdDiagnosticsCollector", () => {
  it("should start empty", () => {
    const collector = createAdDiagnosticsCollector();
    expect(collector.get()).toEqual({});
  });

  it("should accumulate properties", () => {
    const collector = createAdDiagnosticsCollector();
    collector.add({ a: 1 });
    collector.add({ b: 2 });
    expect(collector.get()).toEqual({ a: 1, b: 2 });
  });

  it("should overwrite existing keys", () => {
    const collector = createAdDiagnosticsCollector();
    collector.add({ outcome: "pending" });
    collector.add({ outcome: "success" });
    expect(collector.get()).toEqual({ outcome: "success" });
  });
});
