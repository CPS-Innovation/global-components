import { pipe } from "./pipe";

describe("pipe", () => {
  describe("with single function", () => {
    it("should apply one transformation", () => {
      const result = pipe(1, (x) => x + 1);
      expect(result).toBe(2);
    });

    it("should work with string transformation", () => {
      const result = pipe("hello", (s) => s.toUpperCase());
      expect(result).toBe("HELLO");
    });

    it("should work with type conversion", () => {
      const result = pipe(42, (n) => n.toString());
      expect(result).toBe("42");
    });
  });

  describe("with two functions", () => {
    it("should chain two transformations", () => {
      const result = pipe(
        1,
        (x) => x + 1,
        (x) => x * 2
      );
      expect(result).toBe(4);
    });

    it("should chain type conversions", () => {
      const result = pipe(
        5,
        (n) => n.toString(),
        (s) => s.length
      );
      expect(result).toBe(1);
    });

    it("should work with array transformations", () => {
      const result = pipe(
        [1, 2, 3],
        (arr) => arr.map((x) => x * 2),
        (arr) => arr.filter((x) => x > 2)
      );
      expect(result).toEqual([4, 6]);
    });
  });

  describe("with three functions", () => {
    it("should chain three transformations", () => {
      const result = pipe(
        2,
        (x) => x + 3,
        (x) => x * 2,
        (x) => x - 1
      );
      expect(result).toBe(9); // ((2 + 3) * 2) - 1 = 9
    });

    it("should chain multiple type conversions", () => {
      const result = pipe(
        "hello",
        (s) => s.length,
        (n) => n * 2,
        (n) => `Length doubled: ${n}`
      );
      expect(result).toBe("Length doubled: 10");
    });

    it("should work with object transformations", () => {
      const result = pipe(
        { name: "test", value: 5 },
        (obj) => ({ ...obj, value: obj.value * 2 }),
        (obj) => ({ ...obj, name: obj.name.toUpperCase() }),
        (obj) => obj.name + ":" + obj.value
      );
      expect(result).toBe("TEST:10");
    });
  });

  describe("edge cases", () => {
    it("should handle null values", () => {
      const result = pipe(
        null as string | null,
        (x) => x ?? "default"
      );
      expect(result).toBe("default");
    });

    it("should handle undefined values", () => {
      const result = pipe(
        undefined as number | undefined,
        (x) => x ?? 0,
        (x) => x + 1
      );
      expect(result).toBe(1);
    });

    it("should handle empty string", () => {
      const result = pipe(
        "",
        (s) => s || "empty",
        (s) => s.toUpperCase()
      );
      expect(result).toBe("EMPTY");
    });

    it("should handle empty array", () => {
      const result = pipe(
        [] as number[],
        (arr) => arr.length,
        (len) => len === 0
      );
      expect(result).toBe(true);
    });

    it("should preserve object references when not transformed", () => {
      const original = { a: 1 };
      const result = pipe(original, (obj) => obj);
      expect(result).toBe(original);
    });
  });

  describe("real-world scenarios", () => {
    it("should process user data pipeline", () => {
      interface User {
        firstName: string;
        lastName: string;
        age: number;
      }

      const result = pipe(
        { firstName: "john", lastName: "doe", age: 25 } as User,
        (user) => ({
          ...user,
          firstName: user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1),
          lastName: user.lastName.charAt(0).toUpperCase() + user.lastName.slice(1),
        }),
        (user) => `${user.firstName} ${user.lastName}`,
        (name) => name.trim()
      );
      expect(result).toBe("John Doe");
    });

    it("should process numeric calculations", () => {
      const result = pipe(
        [1, 2, 3, 4, 5],
        (arr) => arr.filter((n) => n % 2 === 0),
        (arr) => arr.reduce((sum, n) => sum + n, 0),
        (sum) => sum / 2
      );
      expect(result).toBe(3); // [2, 4] -> 6 -> 3
    });

    it("should validate and transform input", () => {
      const result = pipe(
        "  42  ",
        (s) => s.trim(),
        (s) => parseInt(s, 10),
        (n) => (isNaN(n) ? 0 : n)
      );
      expect(result).toBe(42);
    });

    it("should handle async-like patterns with sync code", () => {
      type Result<T> = { success: true; data: T } | { success: false; error: string };

      const result = pipe(
        { success: true, data: 5 } as Result<number>,
        (r) => (r.success ? { success: true as const, data: r.data * 2 } : r),
        (r) => (r.success ? r.data : -1)
      );
      expect(result).toBe(10);
    });
  });

  describe("function composition order", () => {
    it("should execute functions left to right", () => {
      const order: number[] = [];

      pipe(
        0,
        (x) => {
          order.push(1);
          return x;
        },
        (x) => {
          order.push(2);
          return x;
        },
        (x) => {
          order.push(3);
          return x;
        }
      );

      expect(order).toEqual([1, 2, 3]);
    });

    it("should pass result of each function to the next", () => {
      const results: number[] = [];

      pipe(
        1,
        (x) => {
          results.push(x);
          return x + 1;
        },
        (x) => {
          results.push(x);
          return x + 1;
        },
        (x) => {
          results.push(x);
          return x + 1;
        }
      );

      expect(results).toEqual([1, 2, 3]);
    });
  });
});
