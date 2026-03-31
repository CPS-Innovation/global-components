import { Config } from "cps-global-configuration";
import { fetchWithCircuitBreaker } from "../fetch/fetch-with-circuit-breaker";
import { fetchWithAuthFactory } from "../fetch/fetch-with-auth-factory";
import { FoundContext } from "../context/FoundContext";
import { ReadyStateHelper, Subscribe } from "../../store/store";
import { caseDetailsSubscriptionFactory } from "./case-details-subscription-factory";
import { Handover } from "../state/handover/Handover";
import { GetToken } from "../auth/GetToken";
import { pipe } from "../../utils/pipe";
import { AnalyticsEventData } from "../analytics/analytics-event";
import { CaseDetails } from "./CaseDetails";

export const initialiseCaseDetailsData = ({
  config,
  context,
  subscribe,
  setNextHandover,
  setNextRecentCases,
  getToken,
  readyState,
  trackEvent,
  preventDataCalls,
}: {
  config: Config;
  context: FoundContext;
  subscribe: Subscribe;
  setNextHandover: (data: Handover) => void;
  setNextRecentCases: (caseDetails: CaseDetails | undefined) => void;
  getToken: GetToken;
  readyState: ReadyStateHelper;
  trackEvent: (detail: AnalyticsEventData) => void;
  preventDataCalls?: boolean;
}) => {
  const isDataAccessEnabled = !!config.GATEWAY_URL;
  if (!isDataAccessEnabled) {
    return;
  }

  subscribe(
    caseDetailsSubscriptionFactory({
      setNextHandover,
      setNextRecentCases,
      showMonitoringCodes: !!config.SHOW_MONITORING_CODES,
      fetch: preventDataCalls
        ? undefined
        : pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, readyState })),
    }),
  );
};
