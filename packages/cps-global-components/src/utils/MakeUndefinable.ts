export type MakeUndefinable<T> = {
  [K in keyof T]: T[K] | undefined;
};
