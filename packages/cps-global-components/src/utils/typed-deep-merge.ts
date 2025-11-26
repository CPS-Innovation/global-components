import { deepmergeCustom } from "deepmerge-ts";

// Like Partial but every nested object itself becomes Partial
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Create a type-safe merge function that only accepts DeepPartials of the same type
export const typedDeepMerge = <T>(
  base: DeepPartial<T>,
  ...overrides: (DeepPartial<T> | undefined)[]
): DeepPartial<T> =>
  deepmergeCustom<DeepPartial<T | undefined>>(
    // Our preference when dealing with arrays:
    //  - if it is an array of an object, then we want to overlay our configs
    //   i.e. merge the values we find over each other
    // - if we have an array of primitives, we want the last config to win
    //   i.e. we can overwrite arr: ["foo", "bar"] with arr: ["bar", "bar"]
    {
      mergeArrays: (values) => {
        if (values.length < 2) return values[0] || [];

        const target = values[0] as unknown[];
        const source = values[values.length - 1] as unknown[];

        // Check if source is primitive array
        const isSourcePrimitive = source.every(
          (item) => item == null || typeof item !== "object"
        );

        // Replace for empty or primitive arrays
        if (source.length === 0 || isSourcePrimitive) {
          return source;
        }

        // Overlay objects: merge by index position
        const result: unknown[] = [];
        const length = Math.max(target.length, source.length);

        for (let i = 0; i < length; i++) {
          const targetItem = target[i];
          const sourceItem = source[i];

          if (sourceItem === undefined) {
            // No source item at this index, keep target
            result.push(targetItem);
          } else if (targetItem === undefined) {
            // No target item at this index, use source
            result.push(sourceItem);
          } else if (
            typeof sourceItem === "object" &&
            sourceItem !== null &&
            typeof targetItem === "object" &&
            targetItem !== null
          ) {
            // Both are objects, deep merge them
            result.push(typedDeepMerge(targetItem, sourceItem));
          } else {
            // At least one is primitive, source wins
            result.push(sourceItem);
          }
        }

        return result;
      },
    }
  )(base, ...overrides) as Partial<T>;
