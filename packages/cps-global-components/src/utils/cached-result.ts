const cache = new WeakMap<Function, any>();

export const cachedResult = <T>(fn: () => T): T => {
  if (!cache.has(fn)) {
    cache.set(fn, fn());
  }
  return cache.get(fn);
};
