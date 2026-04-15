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

const DEFAULT_REFRESH_PERIOD_MINS = 24 * 60;

const { _warn } = makeConsole("initialiseUserData");

type Props = {
  config: Config;
  userDataHint: Result<UserDataHint>;
  setUserDataHint: (userData: UserData) => void;
  trackEvent: (detail: AnalyticsEventData) => void;
  register: Register;
};

export const initialiseUserData = ({ config, userDataHint, setUserDataHint, trackEvent, register }: Props) => {
  const refreshPeriodMins = config.USER_DATA_REFRESH_PERIOD_MINS ?? DEFAULT_REFRESH_PERIOD_MINS;
  const refreshPeriodMs = refreshPeriodMins * 60 * 1000;

  let lastKnownTimestamp = userDataHint.found ? userDataHint.result.timestamp : 0;
  let inFlight: Promise<void> | undefined;

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
    if (inFlight) {
      return inFlight;
    }

    const authedFetch = pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, correlationIds }));

    inFlight = fetchAndValidate(authedFetch, "/api/global-components/user-data", UserDataSchema)
      .then(userData => {
        const timestamp = Date.now();
        lastKnownTimestamp = timestamp;
        setUserDataHint(userData);
        register({ userDataHint: { found: true, result: { userData, timestamp } } });
      })
      .catch(error => {
        _warn("Unexpected error fetching user data", String(error));
      })
      .finally(() => {
        inFlight = undefined;
      });

    return inFlight;
  };

  return { initialiseUserDataForContext };
};
