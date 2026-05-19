import { assignBuckets } from "./assign-buckets";

// Deterministic v4-shaped UUID generator backed by Mulberry32. Lets the
// distribution tests below run against realistic subject IDs (Entra `oid`
// values are UUIDs) without committing a fixture file.
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const generateUuids = (count: number, seed = 1): string[] => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const bytes = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = bytes.map(b => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  });
};

describe("assignBuckets", () => {
  it("returns 'control' when there are no variants", () => {
    const result = assignBuckets({ subjectId: "user-1", salt: "exp", variants: {} });
    expect(result).toBe("control");
  });

  it("returns the only variant when it spans the whole range (100%)", () => {
    const result = assignBuckets({ subjectId: "user-1", salt: "exp", variants: { treatment: 100 } });
    expect(result).toBe("treatment");
  });

  it("returns 'control' when no variant gets any weight (0%)", () => {
    const result = assignBuckets({ subjectId: "user-1", salt: "exp", variants: { treatment: 0 } });
    expect(result).toBe("control");
  });

  it("is deterministic — same inputs produce the same assignment", () => {
    const opts = { subjectId: "user-42", salt: "exp", variants: { a: 25, b: 25, c: 25 } };
    const first = assignBuckets(opts);
    const second = assignBuckets(opts);
    const third = assignBuckets(opts);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it("uses the salt to produce independent assignments for the same subject", () => {
    // For a 50/50 split, roughly half of the (subject, salt) pairs will differ
    // when the salt changes. Sample 100 subjects across two salts and assert
    // the disagreement rate is non-trivial — guards against the salt being
    // ignored in the hash.
    const subjects = Array.from({ length: 100 }, (_, i) => `subject-${i}`);
    let differences = 0;
    for (const subjectId of subjects) {
      const a = assignBuckets({ subjectId, salt: "salt-A", variants: { on: 50 } });
      const b = assignBuckets({ subjectId, salt: "salt-B", variants: { on: 50 } });
      if (a !== b) {
        differences++;
      }
    }
    expect(differences).toBeGreaterThan(20);
    expect(differences).toBeLessThan(80);
  });

  it("approximates the configured weights across a large sample", () => {
    // 1000 subjects, 10/20/70 split. Tolerate ±5pp drift to absorb hash noise.
    const counts = { a: 0, b: 0, control: 0 } as Record<string, number>;
    for (let i = 0; i < 1000; i++) {
      const variant = assignBuckets({ subjectId: `s-${i}`, salt: "dist", variants: { a: 10, b: 20 } });
      counts[variant]++;
    }
    expect(counts.a).toBeGreaterThan(50);
    expect(counts.a).toBeLessThan(150);
    expect(counts.b).toBeGreaterThan(150);
    expect(counts.b).toBeLessThan(250);
    expect(counts.control).toBeGreaterThan(650);
    expect(counts.control).toBeLessThan(750);
  });

  it("never returns 'control' when variant weights sum to 100", () => {
    for (let i = 0; i < 200; i++) {
      const variant = assignBuckets({ subjectId: `s-${i}`, salt: "full", variants: { a: 50, b: 50 } });
      expect(variant).not.toBe("control");
      expect(["a", "b"]).toContain(variant);
    }
  });

  it("falls through to 'control' for the residual share when weights sum to less than 100", () => {
    // Single variant at 1% — across 500 subjects most should land in 'control'.
    let controlCount = 0;
    for (let i = 0; i < 500; i++) {
      const variant = assignBuckets({ subjectId: `s-${i}`, salt: "tiny", variants: { rare: 1 } });
      if (variant === "control") {
        controlCount++;
      }
    }
    expect(controlCount).toBeGreaterThan(450);
  });

  describe("distribution against UUID subjects", () => {
    // Sample size & tolerance are tuned together: at n=10000 the 95% CI for a
    // single proportion is ~±1pp at the centre and tighter at the edges. A
    // ±1.5pp band absorbs that comfortably while still catching gross bias.
    const UUIDS = generateUuids(10000);
    const TOLERANCE = 150;

    const countOn = (weight: number): number => {
      let on = 0;
      for (const subjectId of UUIDS) {
        if (assignBuckets({ subjectId, salt: "dist-uuid", variants: { on: weight } }) === "on") {
          on++;
        }
      }
      return on;
    };

    it.each([
      [1, 100],
      [5, 500],
      [25, 2500],
      [50, 5000],
      [75, 7500],
      [99, 9900],
    ])("buckets ~%i%% of UUID subjects into the variant", (percent, expected) => {
      const on = countOn(percent);
      expect(on).toBeGreaterThanOrEqual(expected - TOLERANCE);
      expect(on).toBeLessThanOrEqual(expected + TOLERANCE);
    });

    it("buckets exactly 100% when the variant spans the whole range", () => {
      expect(countOn(100)).toBe(UUIDS.length);
    });

    it("buckets exactly 0% when the variant has no weight", () => {
      expect(countOn(0)).toBe(0);
    });
  });
});
