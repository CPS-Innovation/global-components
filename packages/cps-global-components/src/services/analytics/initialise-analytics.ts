import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../auth/AuthResult";
import { FoundContext } from "../context/FoundContext";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { AnalyticsEvent, AnalyticsEventData, trackEvent } from "./analytics-event";
import { makeConsole } from "../../logging/makeConsole";
import { Build, ReadyStateHelper } from "../../store/store";
import { CmsSessionHintResult } from "../cms-session/CmsSessionHint";

const STORAGE_PREFIX = "cps_global_components";

type Props = { window: Window; config: Config; auth: AuthResult; readyState: ReadyStateHelper; build: Build; cmsSessionHint: CmsSessionHintResult };

export type Analytics = ReturnType<typeof initialiseAnalytics>;

const { _debug } = makeConsole("initialiseAnalytics");

export const initialiseAnalytics = ({ window, config: { APP_INSIGHTS_CONNECTION_STRING, ENVIRONMENT }, auth, readyState, build, cmsSessionHint: { hint } }: Props) => {
  if (!APP_INSIGHTS_CONNECTION_STRING) {
    return { trackPageView: () => {}, trackException: () => {}, rebindTrackEvent: () => {}, trackEvent: (_: AnalyticsEventData) => {} };
  }

  const appInsights = new ApplicationInsights({
    config: {
      connectionString: APP_INSIGHTS_CONNECTION_STRING,
      // Make sure the names of the session storage buffers do not clash with the host
      //  app's own use of app insights
      namePrefix: STORAGE_PREFIX,
      // Not sure what this one does: I think it is the storage object used when app insights
      //  tracking requests are not getting through to the server (network down?)
      storagePrefix: STORAGE_PREFIX,

      // Stop auto-collection of XHR and fetch (dependencies, and we do not want host app logs)
      disableAjaxTracking: true,
      disableFetchTracking: true,

      // Stop auto exception collection (we'll send only the exceptions we want)
      disableExceptionTracking: true,

      // Stop console -> traces being auto-collected: set console logging off.
      // (0 = off, 1 = critical only, 2 = errors & warnings)
      loggingLevelConsole: 0,

      // Don't globally disable telemetry — we still want to send manual telemetry
      disableTelemetry: false,

      // Do not auto-track SPA route changes
      enableAutoRouteTracking: false,
    },
  });

  appInsights.addTelemetryInitializer(envelope => {
    // We are a guest in the host app so we do not want to capture telemetry that
    //  they should be (for reasons of hygiene and to keep our analytics data usage minimal)
    const baseType = envelope.baseType;
    if (!baseType) {
      return false;
    }

    const allowed = new Set(["EventData", "ExceptionData", "PageviewData"]);
    if (!allowed.has(baseType)) {
      return false;
    }

    if (baseType === "ExceptionData") {
      if (envelope.data && envelope.data.source === STORAGE_PREFIX) {
        // This is our exception, so clear the artificial source prop
        //  and continue
        envelope.data.source = undefined;
      } else {
        // This is not our exception (it is from the host app)
        return false;
      }
    }

    return true;
  });

  appInsights.loadAppInsights();

  let authValues = { IsAuthed: auth.isAuthed } as Record<string, string | boolean>;
  if (auth.isAuthed) {
    authValues = { Username: auth.username, ...authValues };
  }

  const trackPageView = ({ context: { found, contextIds }, correlationIds }: { context: FoundContext; correlationIds: CorrelationIds }) => {
    const arg = { properties: { Environment: ENVIRONMENT, ...authValues, ...build, context: { found, contextIds }, correlationIds, hint } };
    _debug("trackPageView", arg);
    appInsights.trackPageView(arg);
  };

  const trackException = (exception: Error) => {
    appInsights.trackException({ exception }, { source: STORAGE_PREFIX, properties: { Environment: ENVIRONMENT, ...authValues, ...build } });
  };

  window.addEventListener(AnalyticsEvent.type, (ev: AnalyticsEvent) => {
    _debug("trackEvent", ev);
    const { name, ...rest } = ev.detail;
    const state = readyState("correlationIds");
    const correlationIds = state.isReady ? state.state.correlationIds : {};

    appInsights.trackEvent({ name: ev.type, properties: { ...rest, ...correlationIds } });
  });

  return { trackPageView, trackException, trackEvent };
};
