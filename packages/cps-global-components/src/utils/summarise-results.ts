import { Result } from "./Result";

// djb2 — cheap, deterministic, ~0 collision risk for same content.
// Returns 8 hex chars — enough to diff two snapshots by eye.
const hash = (str: string): string => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

export type ResultSummary = "errored" | "empty" | `populated:${number}b:${string}`;

export type ResultsSummary = Record<string, ResultSummary>;

export const summariseResults = (results: Record<string, Result<unknown>>): ResultsSummary => {
  const out: Record<string, ResultSummary> = {};
  for (const [key, r] of Object.entries(results)) {
    if (!r.found) {
      out[key] = "errored";
      continue;
    }
    const serialized = JSON.stringify(r.result);
    if (!serialized || serialized === "null" || serialized === "{}" || serialized === "[]") {
      out[key] = "empty";
      continue;
    }
    out[key] = `populated:${serialized.length}b:${hash(serialized)}`;
  }
  return out;
};
