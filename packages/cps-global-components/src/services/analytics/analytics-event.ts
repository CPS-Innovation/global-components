export type AnalyticsEventData = { name: "loaded"; componentName: string } | { name: "fetch"; error: string };

export class AnalyticsEvent extends CustomEvent<AnalyticsEventData> {
  static type = "cps-global-components-analytics-event";
  constructor(detail: AnalyticsEventData) {
    super(AnalyticsEvent.type, {
      detail,
      bubbles: true,
      cancelable: true,
    });
  }
}

export const trackEvent = (detail: AnalyticsEventData) => {
  window.dispatchEvent(new AnalyticsEvent(detail));
};

export type TrackEvent = typeof trackEvent;
