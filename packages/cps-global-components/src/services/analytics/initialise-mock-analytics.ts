import { AnalyticsEventData } from "./analytics-event";

export const initialiseMockAnalytics = () => ({
  trackPageView: () => {},
  trackException: () => {},
  trackEvent: (_: AnalyticsEventData) => {},
  registerAuthWithAnalytics: () => {},
  registerCorrelationIdsWithAnalytics: () => {},
  registerCaseIdentifiersWithAnalytics: () => {},
  getOperationId: (): string | undefined => undefined,
});
