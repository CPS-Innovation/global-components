export type FeatureFlag<T> = {
  ready?: boolean;
  wait?: boolean;
  broken?: boolean;
  result?: T;
  error?: Error;
};
