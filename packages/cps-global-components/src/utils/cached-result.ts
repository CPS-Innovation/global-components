const cache = new Map<string, any>();

export const cachedResult = <T>(key: string, fn: () => T): T => {
  if (!cache.has(key)) {
    cache.set(key, fn());
  }
  return cache.get(key);
};
