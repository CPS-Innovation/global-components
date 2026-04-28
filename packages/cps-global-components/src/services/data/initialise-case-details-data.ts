import { Config } from "cps-global-configuration";
import { fetchWithCircuitBreaker } from "../fetch/fetch-with-circuit-breaker";
import { fetchWithAuthFactory } from "../fetch/fetch-with-auth-factory";
import { FoundContext } from "../context/FoundContext";
import { MergeTags, Register } from "../../store/store";
import { Handover } from "../state/handover/Handover";
import { GetToken } from "../auth/GetToken";
import { pipe } from "../../utils/pipe";
import { AnalyticsEventData } from "../analytics/analytics-event";
import { CaseDetails, CaseDetailsSchema } from "./CaseDetails";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";
import { MonitoringCodesSchema } from "./MonitoringCode";
import { fetchAndValidate } from "../fetch/fetch-and-validate";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { Result } from "../../utils/Result";
import { TrackException } from "../analytics/TrackException";

type Props = {
  config: Config;
  handover: Result<Handover>;
  setNextHandover: (data: Handover, trackException: TrackException) => void;
  setNextRecentCases: (caseDetails: CaseDetails | undefined) => void;
  trackEvent: (detail: AnalyticsEventData) => void;
  trackException: TrackException;
  register: Register;
  mergeTags: MergeTags;
};

export const initialiseCaseDetailsData = ({ config, handover, setNextHandover, setNextRecentCases, trackEvent, trackException, register, mergeTags }: Props) => {
  let optimisticCaseId: number | undefined;
  let generation = 0;

  // Called as soon as caseIdentifiers are known (before auth completes).
  // Sets store from handover if available — no network, instant.
  const initialiseCaseDetailsDataForContextOptimistic = (caseIdentifiers: CaseIdentifiers | undefined) => {
    generation++;
    optimisticCaseId = undefined;
    if (!caseIdentifiers) return;

    const caseId = Number(caseIdentifiers.caseId);
    if (handover.found && handover.result.caseId === caseId && handover.result.caseDetails) {
      optimisticCaseId = caseId;
      mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(handover.result.caseDetails).tags });
      register({ caseDetails: { found: true, result: handover.result.caseDetails } });
      if (handover.result.monitoringCodes) {
        register({ caseMonitoringCodes: { found: true, result: handover.result.monitoringCodes } });
      }
    }
  };

  // Called after auth completes. Fetches from network if the optimistic path didn't cover it.
  const initialiseCaseDetailsDataForContext = ({
    context,
    caseIdentifiers,
    getToken,
    correlationIds,
  }: {
    context: FoundContext;
    caseIdentifiers: CaseIdentifiers | undefined;
    getToken: GetToken;
    correlationIds: CorrelationIds;
  }) => {
    if (!config.GATEWAY_URL || !caseIdentifiers || context.preventADAndDataCalls) return;

    const caseId = Number(caseIdentifiers.caseId);

    // Optimistic path already handled this case from handover
    if (optimisticCaseId === caseId) return;

    const thisGeneration = generation;
    const isStale = () => thisGeneration !== generation;

    const authedFetch = pipe(fetch, fetchWithCircuitBreaker({ config, trackEvent }), fetchWithAuthFactory({ config, context, getToken, correlationIds }));

    const caseDetailsPromise = fetchAndValidate(authedFetch, `/api/global-components/cases/${caseId}/summary`, CaseDetailsSchema)
      .then(caseDetails => {
        if (isStale()) return undefined;
        mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetails).tags });
        register({ caseDetails: { found: true, result: caseDetails } });
        return caseDetails;
      })
      .catch(error => {
        if (isStale()) return undefined;
        register({ caseDetails: { found: false, error } });
        trackException(error instanceof Error ? error : new Error(String(error)), { type: "data", code: "case-details" });
        return undefined;
      });

    const monitoringCodesPromise = !config.SHOW_MONITORING_CODES
      ? Promise.resolve(undefined)
      : fetchAndValidate(authedFetch, `/api/global-components/cases/${caseId}/monitoring-codes?assignedOnly=true`, MonitoringCodesSchema)
          .then(caseMonitoringCodes => {
            if (isStale()) return undefined;
            register({ caseMonitoringCodes: { found: true, result: caseMonitoringCodes } });
            return caseMonitoringCodes;
          })
          .catch(error => {
            if (isStale()) return undefined;
            register({ caseMonitoringCodes: { found: false, error } });
            trackException(error instanceof Error ? error : new Error(String(error)), { type: "data", code: "case-monitoring-codes" });
            return undefined;
          });

    return Promise.all([caseDetailsPromise, monitoringCodesPromise]).then(([caseDetails, monitoringCodes]) => {
      if (isStale()) return;
      const handoverData = { caseId, caseDetails, monitoringCodes };
      setNextHandover(handoverData, trackException);
      register({ handover: { found: true, result: handoverData } });
      setNextRecentCases(caseDetails);
    });
  };

  return { initialiseCaseDetailsDataForContext, initialiseCaseDetailsDataForContextOptimistic };
};
