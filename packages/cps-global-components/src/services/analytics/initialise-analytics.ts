import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../auth/AuthResult";
import { FoundContext } from "../context/FoundContext";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { AnalyticsEvent } from "./analytics-event";
import { _console } from "../../logging/_console";

const STORAGE_PREFIX = "cps_global_components";

type Props = { window: Window; config: Config; auth: AuthResult };
declare global {
  interface Window {
    cps_global_components_build?: // title case properties as we put these values straight
    // into analytics and that is the convention there
    { Branch: string; Sha: string; RunId: number; Timestamp: string };
  }
}

export const initialiseAnalytics = ({ window, config: { APP_INSIGHTS_KEY, ENVIRONMENT }, auth }: Props) => {
  if (!APP_INSIGHTS_KEY) {
    return { trackPageView: () => {}, trackException: () => {}, rebindTrackEvent: () => {} };
  }

  const connectionString = [
    `InstrumentationKey=${APP_INSIGHTS_KEY}`,
    "IngestionEndpoint=https://uksouth-1.in.applicationinsights.azure.com/",
    "LiveEndpoint=https://uksouth.livediagnostics.monitor.azure.com/",
    "ApplicationId=3dafc37d-8c9c-4480-90fc-532ac2b8bba2",
  ].join(";");

  const appInsights = new ApplicationInsights({
    config: {
      connectionString,
      // Make sure the names of the session storage buffers do not clash with the host
      //  app's own use of app insights
      namePrefix: STORAGE_PREFIX,
      // Not sure what this one does: I think it is the storage object used when app insights
      //  tracking requests are not getting through to the server (network down?)
      storagePrefix: STORAGE_PREFIX,
    },
  });

  appInsights.loadAppInsights();

  let authValues = { IsAuthed: auth.isAuthed } as Record<string, string | boolean>;
  if (auth.isAuthed) {
    authValues = { Username: auth.username, ...authValues };
  }

  const trackPageView = ({ context: { found }, correlationIds }: { context: FoundContext; correlationIds: CorrelationIds }) => {
    const arg = { properties: { Environment: ENVIRONMENT, ...authValues, ...window.cps_global_components_build, context: { found }, correlationIds } };
    _console.debug("initialiseAnalytics", "trackPageView", arg);
    appInsights.trackPageView(arg);
  };

  const trackException = (exception: Error) => {
    appInsights.trackException({ exception }, { properties: { Environment: ENVIRONMENT, ...authValues, ...window.cps_global_components_build } });
  };

  let listenerRef: EventListenerOrEventListenerObject = () => {};

  const rebindTrackEvent = ({ correlationIds }: { correlationIds: CorrelationIds }) => {
    _console.debug("initialiseAnalytics", "rebindTrackEvent", correlationIds);

    window.removeEventListener(AnalyticsEvent.type, listenerRef);
    window.addEventListener(
      AnalyticsEvent.type,
      (listenerRef = (ev: AnalyticsEvent) => {
        _console.debug("initialiseAnalytics", "trackEvent", ev);
        const { name, ...rest } = ev.detail;
        appInsights.trackEvent({ name: ev.type, properties: { ...rest, correlationIds } });
      }),
    );
  };

  return { trackPageView, trackException, rebindTrackEvent };
};
