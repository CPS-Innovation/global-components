import { assignBuckets } from "./assign-buckets";

describe("assignBuckets", () => {
  it("returns 'control' when there are no variants", async () => {
    const result = await assignBuckets({ subjectId: "user-1", salt: "exp", variants: {} });
    expect(result).toBe("control");
  });

  it("returns the only variant when it spans the whole range (100%)", async () => {
    const result = await assignBuckets({ subjectId: "user-1", salt: "exp", variants: { treatment: 100 } });
    expect(result).toBe("treatment");
  });

  it("returns 'control' when no variant gets any weight (0%)", async () => {
    const result = await assignBuckets({ subjectId: "user-1", salt: "exp", variants: { treatment: 0 } });
    expect(result).toBe("control");
  });

  it("is deterministic — same inputs produce the same assignment", async () => {
    const opts = { subjectId: "user-42", salt: "exp", variants: { a: 25, b: 25, c: 25 } };
    const first = await assignBuckets(opts);
    const second = await assignBuckets(opts);
    const third = await assignBuckets(opts);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("uses the salt to produce independent assignments for the same subject", async () => {
    // For a 50/50 split, roughly half of the (subject, salt) pairs will differ
    // when the salt changes. Sample 100 subjects across two salts and assert
    // the disagreement rate is non-trivial — guards against the salt being
    // ignored in the hash.
    const subjects = Array.from({ length: 100 }, (_, i) => `subject-${i}`);
    let differences = 0;
    for (const subjectId of subjects) {
      const a = await assignBuckets({ subjectId, salt: "salt-A", variants: { on: 50 } });
      const b = await assignBuckets({ subjectId, salt: "salt-B", variants: { on: 50 } });
      if (a !== b) {
        differences++;
      }
    }
    expect(differences).toBeGreaterThan(20);
    expect(differences).toBeLessThan(80);
  });

  it("approximates the configured weights across a large sample", async () => {
    // 1000 subjects, 10/20/70 split. Tolerate ±5pp drift to absorb hash noise.
    const counts = { a: 0, b: 0, control: 0 } as Record<string, number>;
    for (let i = 0; i < 1000; i++) {
      const variant = await assignBuckets({ subjectId: `s-${i}`, salt: "dist", variants: { a: 10, b: 20 } });
      counts[variant]++;
    }
    expect(counts.a).toBeGreaterThan(50);
    expect(counts.a).toBeLessThan(150);
    expect(counts.b).toBeGreaterThan(150);
    expect(counts.b).toBeLessThan(250);
    expect(counts.control).toBeGreaterThan(650);
    expect(counts.control).toBeLessThan(750);
  });

  it("never returns 'control' when variant weights sum to 100", async () => {
    for (let i = 0; i < 200; i++) {
      const variant = await assignBuckets({ subjectId: `s-${i}`, salt: "full", variants: { a: 50, b: 50 } });
      expect(variant).not.toBe("control");
      expect(["a", "b"]).toContain(variant);
    }
  });

  it("falls through to 'control' for the residual share when weights sum to less than 100", async () => {
    // Single variant at 1% — across 500 subjects most should land in 'control'.
    let controlCount = 0;
    for (let i = 0; i < 500; i++) {
      const variant = await assignBuckets({ subjectId: `s-${i}`, salt: "tiny", variants: { rare: 1 } });
      if (variant === "control") {
        controlCount++;
      }
    }
    expect(controlCount).toBeGreaterThan(450);
  });
});
