import { Config } from "cps-global-configuration";
import { FoundContext } from "../../context/FoundContext";
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
import { UserData, UserDataHint, UserDataSchema } from "./UserData";
import { ExceptionMeta } from "../../analytics/ExceptionMeta";

const DEFAULT_REFRESH_PERIOD_MINS = 24 * 60;

const { _error } = makeConsole("initialiseUserData");

type Props = {
  config: Config;
  userDataHint: Result<UserDataHint>;
  setUserDataHint: (userData: UserData) => void;
  trackEvent: (detail: AnalyticsEventData) => void;
  trackException: (exception: Error, meta: ExceptionMeta) => void;
  register: Register;
};

export const initialiseUserData = ({ config, userDataHint, setUserDataHint, trackEvent, trackException, register }: Props) => {
  const refreshPeriodMins = config.USER_DATA_REFRESH_PERIOD_MINS ?? DEFAULT_REFRESH_PERIOD_MINS;
  const refreshPeriodMs = refreshPeriodMins * 60 * 1000;

  let lastKnownTimestamp = userDataHint.found ? userDataHint.result.timestamp : 0;
  let inFlight: Promise<void> | undefined;
  let priorAttemptErrored = false;

  const initialiseUserDataForContext = ({
    context,
    getToken,
    correlationIds,
  }: {
    context: FoundContext;
    getToken: GetToken;
    correlationIds: CorrelationIds;
  }): Promise<void> => {
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
        setUserDataHint(userData);
        register({ userDataHint: { found: true, result: { userData, timestamp } } });
        trackEvent({ name: "user-data-fetch", outcome: "success" });
      })
      .catch(error => {
        priorAttemptErrored = true;
        _error("Unexpected error fetching user data", error);
        trackException(error instanceof Error ? error : new Error(String(error)), { type: "data", code: "user-data" });
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  return { initialiseUserDataForContext };
};
