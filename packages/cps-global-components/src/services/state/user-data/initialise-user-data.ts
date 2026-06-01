import { AuthResult, Config, FoundContext } from "cps-global-configuration";
import { CorrelationIds } from "../../correlation/CorrelationIds";
import { GetToken } from "../../auth/GetToken";
import { AnalyticsEventData } from "../../analytics/analytics-event";
import { Register } from "../../../store/store";
import { Result } from "../../../utils/Result";
import { fetchWithAuthFactory } from "../../fetch/fetch-with-auth-factory";
import { fetchWithCircuitBreaker } from "../../fetch/fetch-with-circuit-breaker";
import { fetchAndValidate } from "../../fetch/fetch-and-validate";
import { pipe } from "../../../utils/pipe";
import { makeConsole } from "../../../logging/makeConsole";
import { UserDataHint, UserDataSchema, toUserDataHintPayload } from "./UserData";
import { TrackException } from "../../analytics/TrackException";
import { isAbortError, isPageUnloading } from "../../browser/navigation/page-lifecycle";

const DEFAULT_REFRESH_PERIOD_MINS = 24 * 60;

const { _error } = makeConsole("initialiseUserData");

type Props = {
  config: Config;
  userDataHint: Result<UserDataHint>;
  setUserDataHint: (userData: ReturnType<typeof toUserDataHintPayload>, trackException?: TrackException) => void;
  trackEvent: (detail: AnalyticsEventData) => void;
  trackException: TrackException;
  register: Register;
};

export const initialiseUserData = ({ config, userDataHint, setUserDataHint, trackEvent, trackException, register }: Props) => {
  const refreshPeriodMins = config.USER_DATA_REFRESH_PERIOD_MINS ?? DEFAULT_REFRESH_PERIOD_MINS;
  const refreshPeriodMs = refreshPeriodMins * 60 * 1000;

  let lastKnownTimestamp = userDataHint.found ? userDataHint.result.timestamp : 0;
  let inFlight: Promise<void> | undefined;
  let priorAttemptErrored = false;

  const initialiseUserDataForContext = ({ context, getToken, correlationIds, auth }: { context: FoundContext; getToken: GetToken; correlationIds: CorrelationIds; auth: AuthResult }): Promise<void> => {
    // No point fetching with no bearer token. auth resolves (not rejects) even on
    // a FailedAuth / redirect-in-flight outcome, so the caller hands us the result
    // and we decide here whether there's an identity to fetch for.
    if (!auth.isAuthed) {
      return Promise.resolve();
    }
    if (refreshPeriodMins === 0) {
      return Promise.resolve();
    }
    if (context.preventADAndDataCalls || !config.GATEWAY_URL) {
      return Promise.resolve();
    }
    if (Date.now() - lastKnownTimestamp < refreshPeriodMs) {
      return Promise.resolve();
    }
    if (priorAttemptErrored && !config.USER_DATA_ATTEMPT_RETRY_ON_SPA_NAVIGATION) {
      return Promise.resolve();
    }
    if (inFlight) {
      return inFlight;
    }

    const authedFetch = pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, correlationIds }));

    inFlight = fetchAndValidate(authedFetch, "/api/global-components/user-data", UserDataSchema)
      .then(userData => {
        const timestamp = Date.now();
        lastKnownTimestamp = timestamp;
        priorAttemptErrored = false;
        const compactUserData = toUserDataHintPayload(userData);
        setUserDataHint(compactUserData, trackException);
        register({ userDataHint: { found: true, result: { userData: compactUserData, timestamp } } });
        trackEvent({ name: "user-data-fetch", outcome: "success" });
      })
      .catch(error => {
        // A navigation-abort (host moved the page) is not an endpoint failure, so
        // don't flag priorAttemptErrored (which would suppress a later retry) or
        // console-log it. The abort's telemetry is dropped centrally in
        // trackException, so we call it unconditionally.
        if (!isPageUnloading() && !isAbortError(error)) {
          priorAttemptErrored = true;
          _error("Unexpected error fetching user data", error);
        }
        trackException(error instanceof Error ? error : new Error(String(error)), { type: "data", code: "user-data" });
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  return { initialiseUserDataForContext };
};
