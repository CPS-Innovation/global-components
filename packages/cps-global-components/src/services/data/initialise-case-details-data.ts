import { AuthResult, Config, FoundContext } from "cps-global-configuration";
import { fetchWithCircuitBreaker } from "../fetch/fetch-with-circuit-breaker";
import { fetchWithAuthFactory } from "../fetch/fetch-with-auth-factory";
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

type ContextArgs = {
  context: FoundContext;
  caseIdentifiers: CaseIdentifiers | undefined;
  getToken: GetToken;
  correlationIds: CorrelationIds;
  auth: AuthResult;
};

export const initialiseCaseDetailsData = ({ config, handover, setNextHandover, setNextRecentCases, trackEvent, trackException, register, mergeTags }: Props) => {
  let optimisticCaseId: number | undefined;
  let lastSeenCaseId: number | undefined;
  let generation = 0;
  // The arguments of the last per-context call, so a refresh is "do that again"
  // rather than a second call site that has to reassemble them. Kept beside the
  // other closure state for the same reason it is: this service owns when it
  // fetches, and these are part of that decision.
  let lastContextArgs: ContextArgs | undefined;
  // Set by refreshCaseDetailsData and cleared the moment it is honoured. This is
  // the ONLY thing that gets past the handover short-circuit below.
  let refetchRequested = false;

  // Called as soon as caseIdentifiers are known (before auth completes).
  // Sets store from handover if available — no network, instant.
  const initialiseCaseDetailsDataForContextOptimistic = (caseIdentifiers: CaseIdentifiers | undefined) => {
    generation++;
    optimisticCaseId = undefined;

    const caseId = caseIdentifiers ? Number(caseIdentifiers.caseId) : undefined;

    // caseDetailsTags are owned by this service: resetContextSpecificTags leaves them alone so
    //  they survive same-case context changes. Clear them here when the case actually changes
    //  (or goes away) so stale tags from a previous case can't bleed into the new one.
    if (caseId !== lastSeenCaseId) {
      register({ caseDetailsTags: {} });
      lastSeenCaseId = caseId;
    }

    if (!caseIdentifiers || caseId === undefined) {
      return;
    }

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
  const initialiseCaseDetailsDataForContext = (args: ContextArgs) => {
    const { context, caseIdentifiers, getToken, correlationIds, auth } = args;
    // Remembered BEFORE the guards below, so a refresh still works on a context
    // pass that decided not to fetch — which is exactly the handover case, and
    // exactly when the lock we hold is most likely to be out of date.
    lastContextArgs = args;
    // The authed network fetch only makes sense with a token. auth resolves (not
    // rejects) even on a FailedAuth / redirect-in-flight outcome — we make the
    // call/no-call determination here rather than the caller. The optimistic
    // (no-token) path is separate and already ran.
    if (!auth.isAuthed || !config.GATEWAY_URL || !caseIdentifiers || context.preventADAndDataCalls) return;

    const caseId = Number(caseIdentifiers.caseId);

    // Optimistic path already handled this case from handover — unless someone has
    // told us it has gone stale. Handover data is fetched once and passed between
    // apps to be kind to the API, which is right for a URN or a defendant name and
    // wrong for a lock: the lock changes while you sit on the page. This is the
    // same shape as initialise-user-data's refresh window, with an event standing
    // in for elapsed time.
    if (optimisticCaseId === caseId && !refetchRequested) return;
    refetchRequested = false;

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
        // trackException centrally drops navigation-abort noise for type:"data".
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

  /**
   * Fetch the current case's details again, whatever the freshness policy would
   * otherwise have decided.
   *
   * A REFRESH IS THE SAME FETCH ASKED FOR AGAIN — same endpoint, same schema, same
   * generation guard — so there is one code path to reason about rather than two.
   * It takes no arguments because the answer to "which case?" is always "the one we
   * are already on"; the caller is a presence event, which knows nothing about
   * contexts or tokens and should not have to.
   *
   * The side effects are deliberate rather than tolerated: setNextHandover means the
   * next app inherits the fresher lock, and setNextRecentCases already no-ops when
   * the head of the list is unchanged.
   *
   * No-ops before the first per-context call, when there is nothing to repeat.
   */
  const refreshCaseDetailsData = () => {
    if (!lastContextArgs) {
      return;
    }
    refetchRequested = true;
    return initialiseCaseDetailsDataForContext(lastContextArgs);
  };

  return { initialiseCaseDetailsDataForContext, initialiseCaseDetailsDataForContextOptimistic, refreshCaseDetailsData };
};
