import { AnalyticsEventData } from "./analytics-event";
import { ExceptionMeta } from "./ExceptionMeta";
import { FoundContext } from "../context/FoundContext";

export const initialiseMockAnalytics = () => ({
  trackPageView: (_: { context: FoundContext; properties?: Record<string, unknown> }) => {},
  trackException: (_: Error, __: ExceptionMeta) => {},
  trackEvent: (_: AnalyticsEventData) => {},
  registerAuthWithAnalytics: () => {},
  registerCorrelationIdsWithAnalytics: () => {},
  registerCaseIdentifiersWithAnalytics: () => {},
  getOperationId: (): string | undefined => undefined,
});
