// Deterministic percentage-based bucketing for A/B tests and feature rollouts.
// Hashes (salt, subjectId) with SHA-256 and maps the result into [0, 10000),
// giving 0.01% resolution. Same inputs always produce the same bucket, so users
// get a stable assignment without any storage. Weights don't need to sum to 100
// — anything beyond the total falls through to "control" (partial rollouts).

type Options<V extends string> = {
  // Stable identifier for the subject (e.g. Entra `oid`, anonymous cookie ID).
  subjectId: string;
  // Per-experiment salt. Change this to get an independent random assignment.
  salt: string;
  variants: Record<V, number>;
};

const getBucket = async (salt: string, subjectId: string): Promise<number> => {
  const data = new TextEncoder().encode(`${salt}:${subjectId}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new DataView(buf).getUint32(0) % 10000;
};

export const assignBuckets = async <V extends string>({ subjectId, salt, variants }: Options<V>): Promise<V | "control"> => {
  const bucket = await getBucket(salt, subjectId);
  let cumulative = 0;
  for (const [name, weight] of Object.entries(variants) as [V, number][]) {
    cumulative += weight * 100;
    if (bucket < cumulative) {
      return name;
    }
  }
  return "control";
};
