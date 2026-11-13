import { ResultsSummary } from "../../utils/summarise-results";

export type AnalyticsEventData =
  | { name: "loaded"; componentName: string }
  | { name: "fetch"; error: string }
  | { name: "user-data-fetch"; outcome: "success" }
  | { name: "page-view-initiated" }
  | { name: "state-summary"; summary: ResultsSummary }
  | { name: "probe-navigator-permissions"; hostname: string; timestamp: number; localNetworkAccessPermission?: "granted" | "denied" | "prompt" }
  | { name: "notification-dismissed"; notificationId: string }
  | { name: "triage-submission"; [key: string]: string | number | boolean | undefined }
  | { name: "dark-reader-detected"; detection: "sync" | "async" }
  | { name: "case-details-retrieved"; caseId: number; isDcfCase: boolean }
  // Once per page load, the first time the footer shim hides a host <footer> and
  // puts cps-global-footer in its place. contextIds says which app/page it was.
  | { name: "footer-shimmed"; contextIds?: string };

export type TrackEvent = (detail: AnalyticsEventData) => void;
