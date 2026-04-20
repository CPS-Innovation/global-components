export type AnalyticsEventData =
  | { name: "loaded"; componentName: string }
  | { name: "fetch"; error: string }
  | { name: "user-data-fetch"; outcome: "success" }
  | { name: "page-view-initiated" };

export type TrackEvent = (detail: AnalyticsEventData) => void;
