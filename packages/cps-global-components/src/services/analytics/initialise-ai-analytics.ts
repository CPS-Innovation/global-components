import { ApplicationInsights } from "@microsoft/applicationinsights-web";
import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { AnalyticsEvent, AnalyticsEventData, trackEvent } from "./analytics-event";
import { makeConsole } from "../../logging/makeConsole";
import { Build } from "../../store/store";
import { AuthResult, KnownErrorType } from "../auth/AuthResult";
import { capitalizeKeys } from "../../utils/capitalize-keys";
import { Result } from "../../utils/Result";
import { AuthHint } from "../state/auth-hint/initialise-auth-hint";
import { Getter } from "@stencil/store/dist/types";
import { StoredState } from "../../store/store";

const STORAGE_PREFIX = "cps_global_components";

type Props = { window: Window; config: Config; build: Build; authHint?: Result<AuthHint>; get: Getter<StoredState> };

type AuthAnalyticsProps = undefined | { isAuthed: false; knownErrorType: KnownErrorType; username?: string; objectId?: string } | { isAuthed: true; username: string; objectId: string };

export type Analytics = ReturnType<typeof initialiseAiAnalytics>;

const { _debug } = makeConsole("initialiseAnalytics");

export const initialiseAiAnalytics = ({ window, config: { APP_INSIGHTS_CONNECTION_STRING, ENVIRONMENT }, build, authHint, get }: Props) => {
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

  const allowed = new Set(["EventData", "ExceptionData", "PageviewData"]);
  appInsights.addTelemetryInitializer(envelope => {
    // We are a guest in the host app so we do not want to capture telemetry that
    //  they should be (for reasons of hygiene and to keep our analytics data usage minimal)
    const baseType = envelope.baseType;
    if (!baseType) {
      return false;
    }

    if (!allowed.has(baseType)) {
      return false;
    }

    if (baseType === "PageviewData" && envelope.baseData) {
      delete envelope.baseData.refUri;

      if (envelope.baseData.uri) {
        // Let's avoid logging the hash e.g. MSAL return data #code=
        envelope.baseData.uri = envelope.baseData.uri.split("#")[0];
      }
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
  let resolveAuthReady: () => void;
  const authReady = new Promise<void>(resolve => {
    resolveAuthReady = resolve;
  });

  const registerAuth = (auth: AuthResult) => {
    if (auth.isAuthed) {
      authValues = { isAuthed: true, username: auth.username, objectId: auth.objectId };
    } else {
      const hint = authHint?.found ? authHint.result.authResult : undefined;
      authValues = { isAuthed: false, knownErrorType: auth.knownErrorType, ...(hint && { username: hint.username, objectId: hint.objectId }) };
    }
    resolveAuthReady();
  };

  const trackPageView = ({ context: { found, contextIds } }: { context: FoundContext }) => {
    (async () => {
      await authReady;
      const caseId = get("caseIdentifiers")?.caseId;
      const arg = { properties: capitalizeKeys({ environment: ENVIRONMENT, auth: authValues, build: build, context: { found, contextIds }, correlationIds: correlationIdValues, ...(caseId && { caseId }) }) };
      _debug("trackPageView", arg);
      appInsights.trackPageView(arg);
      // Let's do our best to ensure our page view analytics gets registered before the page navigates away.
      //  This is a bit speculative, not sure if this will have a material effect.
      appInsights.flush();
    })();
  };

  const trackException = (exception: Error) => {
    appInsights.trackException({ exception }, { source: STORAGE_PREFIX, properties: capitalizeKeys({ environment: ENVIRONMENT, ...(authValues && { auth: authValues }), build }) });
  };

  window.addEventListener(AnalyticsEvent.type, (ev: AnalyticsEvent) => {
    _debug("trackEvent", ev);
    const { name, ...rest } = ev.detail;

    appInsights.trackEvent({ name: ev.type, properties: { ...rest, correlationIds: correlationIdValues } });
  });

  return { trackPageView, trackException, trackEvent, registerAuth, registerCorrelationIds };
};
