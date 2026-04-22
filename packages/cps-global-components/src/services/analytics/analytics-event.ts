import { ResultsSummary } from "../../utils/summarise-results";

export type AnalyticsEventData =
  | { name: "loaded"; componentName: string }
  | { name: "fetch"; error: string }
  | { name: "user-data-fetch"; outcome: "success" }
  | { name: "page-view-initiated" }
  | { name: "state-summary"; summary: ResultsSummary }
  | { name: "iframe-load-probe"; outcome: "loaded" | "timeout-public" | "timeout-local"; durationMs: number };

export type TrackEvent = (detail: AnalyticsEventData) => void;
