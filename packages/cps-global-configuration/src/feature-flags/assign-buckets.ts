// Deterministic percentage-based bucketing for A/B tests and feature rollouts.
// Hashes (salt, subjectId) with FNV-1a (32-bit) and maps the result into
// [0, 10000), giving 0.01% resolution. Same inputs always produce the same
// bucket, so users get a stable assignment without any storage. Weights don't
// need to sum to 100 — anything beyond the total falls through to "control"
// (partial rollouts).
//
// Sync on purpose: bucketing isn't a security boundary, so a non-crypto hash
// is the right tool — keeps callers (notably the feature-flag layer) sync and
// avoids cascading `await` through every consumer.

type Options<V extends string> = {
  // Stable identifier for the subject (e.g. Entra `oid`, anonymous cookie ID).
  subjectId: string;
  // Per-experiment salt. Change this to get an independent random assignment.
  salt: string;
  variants: Record<V, number>;
};

const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const getBucket = (salt: string, subjectId: string): number => fnv1a32(`${salt}:${subjectId}`) % 10000;

export const assignBuckets = <V extends string>({ subjectId, salt, variants }: Options<V>): V | "control" => {
  const bucket = getBucket(salt, subjectId);
  let cumulative = 0;
  for (const [name, weight] of Object.entries(variants) as [V, number][]) {
    cumulative += weight * 100;
    if (bucket < cumulative) {
      return name;
    }
  }
  return "control";
};
