import { summariseResults } from "./summarise-results";
import { Result } from "./Result";

const found = <T>(result: T): Result<T> => ({ found: true, result });
const errored = (error: unknown): Result<never> => ({ found: false, error: error instanceof Error ? error : new Error(String(error)) });

describe("summariseResults", () => {
  describe("status classification", () => {
    it('returns "errored" when the result is not found', () => {
      const out = summariseResults({ thing: errored(new Error("boom")) });
      expect(out.thing).toBe("errored");
    });

    it('returns "errored" regardless of the error shape', () => {
      const out = summariseResults({ a: errored("string error"), b: errored(undefined), c: errored(null) });
      expect(out).toEqual({ a: "errored", b: "errored", c: "errored" });
    });

    it('returns "empty" when the result is null', () => {
      const out = summariseResults({ thing: found(null) });
      expect(out.thing).toBe("empty");
    });

    it('returns "empty" when the result is an empty object', () => {
      const out = summariseResults({ thing: found({}) });
      expect(out.thing).toBe("empty");
    });

    it('returns "empty" when the result is an empty array', () => {
      const out = summariseResults({ thing: found([]) });
      expect(out.thing).toBe("empty");
    });

    it('returns populated with bytes and hash for a non-empty object', () => {
      const out = summariseResults({ thing: found({ a: 1 }) });
      expect(out.thing).toMatch(/^populated:\d+b:[0-9a-f]{8}$/);
    });
  });

  describe("bytes", () => {
    it("reports byte length of JSON-serialised content", () => {
      const out = summariseResults({ thing: found({ a: 1 }) });
      const [, bytesPart] = (out.thing as string).split(":");
      expect(bytesPart).toBe(`${JSON.stringify({ a: 1 }).length}b`);
    });

    it("counts bytes distinctly for differently-sized payloads", () => {
      const small = summariseResults({ t: found({ x: 1 }) }).t as string;
      const large = summariseResults({ t: found({ x: 1, y: 2, z: 3, w: "a longer string value" }) }).t as string;
      const smallBytes = Number(small.split(":")[1].replace("b", ""));
      const largeBytes = Number(large.split(":")[1].replace("b", ""));
      expect(largeBytes).toBeGreaterThan(smallBytes);
    });
  });

  describe("hash", () => {
    it("produces the same hash for identical content", () => {
      const a = summariseResults({ t: found({ foo: "bar", n: 42 }) }).t;
      const b = summariseResults({ t: found({ foo: "bar", n: 42 }) }).t;
      expect(a).toBe(b);
    });

    it("produces different hashes for different content", () => {
      const a = summariseResults({ t: found({ foo: "bar" }) }).t as string;
      const b = summariseResults({ t: found({ foo: "baz" }) }).t as string;
      expect(a.split(":")[2]).not.toBe(b.split(":")[2]);
    });

    it("is exactly 8 lowercase hex characters", () => {
      const out = summariseResults({ t: found({ anything: "here" }) }).t as string;
      const hashPart = out.split(":")[2];
      expect(hashPart).toMatch(/^[0-9a-f]{8}$/);
    });
  });

  describe("multiple entries", () => {
    it("returns a summary entry per input key, preserving keys", () => {
      const out = summariseResults({
        a: errored(new Error("x")),
        b: found({}),
        c: found({ value: 1 }),
      });
      expect(Object.keys(out).sort()).toEqual(["a", "b", "c"]);
      expect(out.a).toBe("errored");
      expect(out.b).toBe("empty");
      expect(out.c).toMatch(/^populated:\d+b:[0-9a-f]{8}$/);
    });

    it("returns an empty object for no inputs", () => {
      expect(summariseResults({})).toEqual({});
    });
  });
});
