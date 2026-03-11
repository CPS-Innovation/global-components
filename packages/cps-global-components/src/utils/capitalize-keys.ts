type CapitalizeKeys<T> = T extends Array<infer U> ? Array<CapitalizeKeys<U>> : T extends object ? { [K in keyof T as Capitalize<string & K>]: CapitalizeKeys<T[K]> } : T;

export const capitalizeKeys = <T>(value: T): CapitalizeKeys<T> => {
  if (Array.isArray(value)) {
    return value.map(capitalizeKeys) as CapitalizeKeys<T>;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), capitalizeKeys(v)])) as CapitalizeKeys<T>;
  }

  return value as CapitalizeKeys<T>;
};
