import { AnalyticsEventData } from "./analytics-event";

export const initialiseMockAnalytics = () => ({ trackPageView: () => {}, trackException: () => {}, trackEvent: (_: AnalyticsEventData) => {} });
