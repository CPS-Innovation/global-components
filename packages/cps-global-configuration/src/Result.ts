// Structurally identical to the local Result type in cps-global-components/src/utils/Result.ts.
// Defined here too so this package can stay self-contained without a workspace dep on the host.
export type Result<T> =
  | { found: true; result: T; error?: undefined }
  | { found: false; result?: undefined; error: Error };
