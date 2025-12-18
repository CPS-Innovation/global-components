import { Config } from "cps-global-configuration";
import { createCache } from "../cache/create-cache";
import { fetchWithCircuitBreaker } from "../api/fetch-with-circuit-breaker";
import { fetchWithAuthFactory } from "../../services/api/fetch-with-auth-factory";
import { FoundContext } from "../context/FoundContext";
import { ReadyStateHelper, Subscribe } from "../../store/store";
import { caseDetailsSubscriptionFactory } from "./case-details-subscription-factory";
import { Handover } from "../handover/Handover";
import { GetToken } from "../auth/GetToken";
import { pipe } from "../../utils/pipe";
import { AnalyticsEventData } from "../analytics/analytics-event";
import { Result } from "../../utils/Result";

export const initialiseCaseDetailsData = ({
  config,
  context,
  subscribe,
  handover,
  setNextHandover,
  getToken,
  readyState,
  trackEvent,
}: {
  config: Config;
  context: FoundContext;
  subscribe: Subscribe;
  handover: Result<Handover>;
  setNextHandover: (data: Handover) => void;
  getToken: GetToken;
  readyState: ReadyStateHelper;
  trackEvent: (detail: AnalyticsEventData) => void;
}) => {
  const isDataAccessEnabled = !!config.GATEWAY_URL;
  if (!isDataAccessEnabled) {
    return;
  }

  subscribe(
    caseDetailsSubscriptionFactory({
      config,
      handover,
      setNextHandover,
      cache: createCache("cps-global-components-cache"),
      fetch: pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, readyState })),
    }),
  );
};
