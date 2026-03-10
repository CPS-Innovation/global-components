import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { AnalyticsEvent, AnalyticsEventData, trackEvent } from "./analytics-event";
import { makeConsole } from "../../logging/makeConsole";
import { Build } from "../../store/store";
import { AuthResult, KnownErrorType } from "../auth/AuthResult";
import { capitalizeKeys } from "../../utils/capitalize-keys";

const STORAGE_PREFIX = "cps_global_components";

type Props = { window: Window; config: Config; build: Build };

type AuthAnalyticsProps = undefined | { isAuthed: false; knownErrorType: KnownErrorType } | { isAuthed: true; username: string };

export type Analytics = ReturnType<typeof initialiseAiAnalytics>;

const { _debug } = makeConsole("initialiseAnalytics");

export const initialiseAiAnalytics = ({ window, config: { APP_INSIGHTS_CONNECTION_STRING, ENVIRONMENT }, build }: Props) => {
  if (!APP_INSIGHTS_CONNECTION_STRING) {
    return {
      trackPageView: () => {},
      trackException: (_: Error) => {},
      trackEvent: (_: AnalyticsEventData) => {},
      registerAuth: (_: AuthResult) => {},
      registerCorrelationIds: (_: CorrelationIds) => {},
    };
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

    if (baseType === "PageviewData" && envelope.baseData) {
      delete envelope.baseData.refUri;
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

  let correlationIdValues = {} as CorrelationIds | {};
  const registerCorrelationIds = (ids: CorrelationIds) => {
    correlationIdValues = ids;
  };

  let authValues: AuthAnalyticsProps = undefined;
  const registerAuth = (auth: AuthResult) => {
    authValues = auth.isAuthed ? { isAuthed: true, username: auth.username } : { isAuthed: false, knownErrorType: auth.knownErrorType };
  };

  const trackPageView = ({ context: { found, contextIds }, correlationIds }: { context: FoundContext; correlationIds: CorrelationIds }) => {
    const arg = { properties: capitalizeKeys({ environment: ENVIRONMENT, auth: authValues, build: build, context: { found, contextIds }, correlationIds }) };
    _debug("trackPageView", arg);
    appInsights.trackPageView(arg);
  };

  const trackException = (exception: Error) => {
    appInsights.trackException({ exception }, { source: STORAGE_PREFIX, properties: capitalizeKeys({ environment: ENVIRONMENT, auth: authValues, build }) });
  };

  window.addEventListener(AnalyticsEvent.type, (ev: AnalyticsEvent) => {
    _debug("trackEvent", ev);
    const { name, ...rest } = ev.detail;

    appInsights.trackEvent({ name: ev.type, properties: { ...rest, ...correlationIdValues } });
  });

  return { trackPageView, trackException, trackEvent, registerAuth, registerCorrelationIds };
};
