import { typedDeepMerge, DeepPartial } from "./typed-deep-merge";

describe("typedDeepMerge", () => {
  describe("basic merging", () => {
    it("should return the base object when no overrides are provided", () => {
      const base = { a: 1, b: 2 };
      const result = typedDeepMerge(base);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should merge simple objects", () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3, c: 4 };
      const result = typedDeepMerge<{ a: number; b: number; c: number }>(
        base,
        override
      );
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should handle undefined overrides", () => {
      const base = { a: 1, b: 2 };
      const result = typedDeepMerge(base, undefined);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should handle multiple undefined overrides", () => {
      const base = { a: 1, b: 2 };
      const result = typedDeepMerge(base, undefined, undefined);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should apply multiple overrides in order", () => {
      const base = { a: 1, b: 2 };
      const override1 = { b: 3 };
      const override2 = { b: 4 };
      const result = typedDeepMerge(base, override1, override2);
      expect(result).toEqual({ a: 1, b: 4 });
    });
  });

  describe("deep merging", () => {
    it("should merge nested objects", () => {
      const base = { outer: { inner: 1, keep: 2 } };
      const override = { outer: { inner: 3 } };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ outer: { inner: 3, keep: 2 } });
    });

    it("should merge deeply nested objects", () => {
      const base = { level1: { level2: { level3: { value: 1 } } } };
      const override = { level1: { level2: { level3: { value: 2 } } } };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ level1: { level2: { level3: { value: 2 } } } });
    });

    it("should add new nested properties", () => {
      type TestType = {
        existing: { prop: number };
        added?: { newProp: number };
      };
      const base: DeepPartial<TestType> = { existing: { prop: 1 } };
      const override: DeepPartial<TestType> = { added: { newProp: 2 } };
      const result = typedDeepMerge<TestType>(base, override);
      expect(result).toEqual({ existing: { prop: 1 }, added: { newProp: 2 } });
    });
  });

  describe("array merging - primitive arrays", () => {
    it("should replace primitive arrays entirely (source wins)", () => {
      const base = { arr: ["foo", "bar"] };
      const override = { arr: ["baz"] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: ["baz"] });
    });

    it("should replace primitive arrays with equal length", () => {
      const base = { arr: ["foo", "bar"] };
      const override = { arr: ["bar", "bar"] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: ["bar", "bar"] });
    });

    it("should replace with longer primitive array", () => {
      const base = { arr: ["a"] };
      const override = { arr: ["b", "c", "d"] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: ["b", "c", "d"] });
    });

    it("should replace number arrays", () => {
      const base = { arr: [1, 2, 3] };
      const override = { arr: [4, 5] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [4, 5] });
    });

    it("should replace boolean arrays", () => {
      const base = { arr: [true, false] };
      const override = { arr: [false, true, true] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [false, true, true] });
    });

    it("should replace with empty array", () => {
      const base = { arr: ["foo", "bar"] };
      const override = { arr: [] as string[] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [] });
    });

    it("should handle null values in primitive arrays", () => {
      const base = { arr: ["foo", null, "bar"] };
      const override = { arr: [null, "baz"] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [null, "baz"] });
    });
  });

  describe("array merging - object arrays", () => {
    it("should merge object arrays by index position", () => {
      const base = { arr: [{ id: 1, name: "a" }] };
      const override = { arr: [{ id: 2 }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [{ id: 2, name: "a" }] });
    });

    it("should merge multiple objects in arrays by index", () => {
      const base = {
        arr: [
          { id: 1, name: "first" },
          { id: 2, name: "second" },
        ],
      };
      const override = {
        arr: [{ name: "updated-first" }, { name: "updated-second" }],
      };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [
          { id: 1, name: "updated-first" },
          { id: 2, name: "updated-second" },
        ],
      });
    });

    it("should handle source array longer than target", () => {
      const base = { arr: [{ id: 1 }] };
      const override = { arr: [{ name: "a" }, { id: 2, name: "b" }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      });
    });

    it("should handle target array longer than source", () => {
      const base = {
        arr: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      };
      const override = { arr: [{ name: "updated" }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [
          { id: 1, name: "updated" },
          { id: 2, name: "b" },
        ],
      });
    });

    it("should keep target items when source item is undefined", () => {
      const base = {
        arr: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      };
      // Sparse array - index 0 is undefined
      const override = { arr: [undefined, { name: "updated-b" }] as any };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [
          { id: 1, name: "a" },
          { id: 2, name: "updated-b" },
        ],
      });
    });

    it("should deep merge nested objects in arrays", () => {
      const base = {
        arr: [{ outer: { inner: { value: 1, keep: true } } }],
      };
      const override = {
        arr: [{ outer: { inner: { value: 2 } } }],
      };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [{ outer: { inner: { value: 2, keep: true } } }],
      });
    });
  });

  describe("array merging - mixed scenarios", () => {
    it("should handle primitive source overriding object in target", () => {
      const base = { arr: [{ id: 1 }] as any };
      const override = { arr: ["primitive"] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: ["primitive"] });
    });

    it("should handle object source when target has primitive", () => {
      const base = { arr: ["primitive"] as any };
      const override = { arr: [{ id: 1 }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [{ id: 1 }] });
    });

    it("should merge when only some items are objects", () => {
      // If source has at least one object, treat as object array
      const base = { arr: [{ id: 1 }, { id: 2 }] };
      const override = { arr: [{ name: "a" }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({
        arr: [
          { id: 1, name: "a" },
          { id: 2 },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("should handle empty base object", () => {
      const base = {};
      const override = { a: 1 };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ a: 1 });
    });

    it("should handle empty override object", () => {
      const base = { a: 1 };
      const override = {};
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ a: 1 });
    });

    it("should handle null values in objects", () => {
      const base = { a: 1, b: null };
      const override = { b: 2, c: null };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ a: 1, b: 2, c: null });
    });

    it("should handle single element arrays", () => {
      const base = { arr: [] as unknown[] };
      const override = { arr: [{ id: 1 }] };
      const result = typedDeepMerge(base, override);
      expect(result).toEqual({ arr: [{ id: 1 }] });
    });

    it("should not mutate the original objects", () => {
      const base = { a: 1, nested: { b: 2 } };
      const override = { nested: { c: 3 } };
      const baseCopy = JSON.parse(JSON.stringify(base));
      const overrideCopy = JSON.parse(JSON.stringify(override));

      typedDeepMerge(base, override);

      expect(base).toEqual(baseCopy);
      expect(override).toEqual(overrideCopy);
    });
  });

  describe("complex real-world scenarios", () => {
    it("should merge configuration objects with nested arrays", () => {
      type Config = {
        settings: {
          enabled: boolean;
          options: { name: string; value: number }[];
        };
      };

      const defaultConfig: DeepPartial<Config> = {
        settings: {
          enabled: false,
          options: [
            { name: "option1", value: 10 },
            { name: "option2", value: 20 },
          ],
        },
      };

      const envConfig: DeepPartial<Config> = {
        settings: {
          enabled: true,
          options: [{ value: 15 }],
        },
      };

      const result = typedDeepMerge<Config>(defaultConfig, envConfig);

      expect(result).toEqual({
        settings: {
          enabled: true,
          options: [
            { name: "option1", value: 15 },
            { name: "option2", value: 20 },
          ],
        },
      });
    });

    it("should handle multiple override layers", () => {
      const base = { a: 1, b: 2, c: 3 };
      const layer1 = { b: 20 };
      const layer2 = { c: 30 };
      const layer3 = { a: 10 };

      const result = typedDeepMerge(base, layer1, layer2, layer3);
      expect(result).toEqual({ a: 10, b: 20, c: 30 });
    });

    it("should handle multiple override layers with nested objects", () => {
      type NestedConfig = {
        database: { host: string; port: number };
        cache: { enabled: boolean; ttl: number };
      };

      const base: DeepPartial<NestedConfig> = {
        database: { host: "localhost", port: 5432 },
        cache: { enabled: false, ttl: 3600 },
      };
      const staging: DeepPartial<NestedConfig> = {
        database: { host: "staging.db.com" },
        cache: { enabled: true },
      };
      const local: DeepPartial<NestedConfig> = {
        database: { port: 5433 },
      };

      const result = typedDeepMerge<NestedConfig>(base, staging, local);
      expect(result).toEqual({
        database: { host: "staging.db.com", port: 5433 },
        cache: { enabled: true, ttl: 3600 },
      });
    });

    it("should handle mixed undefined in override chain", () => {
      const base = { a: 1, b: 2 };
      const override1 = { a: 10 };
      const override2 = { b: 20 };

      const result = typedDeepMerge(
        base,
        override1,
        undefined,
        override2,
        undefined
      );
      expect(result).toEqual({ a: 10, b: 20 });
    });
  });
});

describe("DeepPartial type", () => {
  it("should allow partial nested objects at compile time", () => {
    type FullType = {
      level1: {
        level2: {
          required: string;
          optional?: number;
        };
      };
    };

    // This test mainly verifies type compilation - the runtime check is simple
    const partial: DeepPartial<FullType> = {
      level1: {
        level2: {},
      },
    };

    expect(partial).toBeDefined();
  });
});
