import { AnalyticsEventData } from "./analytics-event";
import { ExceptionMeta } from "./ExceptionMeta";
import { FoundContext } from "cps-global-configuration";

export const initialiseMockAnalytics = () => ({
  trackPageView: (_: { context: FoundContext; properties?: Record<string, unknown> }) => {},
  trackException: (_: Error, __: ExceptionMeta) => {},
  trackEvent: (_: AnalyticsEventData) => {},
  registerAuthWithAnalytics: () => {},
  registerCorrelationIdsWithAnalytics: () => {},
  registerCaseIdentifiersWithAnalytics: () => {},
});
