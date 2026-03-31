import { CaseDetails, CaseDetailsSchema } from "./CaseDetails";
import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Handover } from "../state/handover/Handover";
import { fetchAndValidate } from "../fetch/fetch-and-validate";
import { MonitoringCodesSchema } from "./MonitoringCode";
import { CaseIdentifiers } from "../context/CaseIdentifiers";

type Props = {
  setNextHandover: (data: Handover) => void;
  setNextRecentCases: (caseDetails: CaseDetails | undefined) => void;
  fetch?: typeof fetch;
  showMonitoringCodes: boolean;
};

const tryHandleEmptyCaseIdentifiers = (
  caseIdentifiers: CaseIdentifiers | undefined,
  { register }: Pick<Parameters<SubscriptionFactory>[0], "register">,
) => {
  if (caseIdentifiers) return false;
  register({ caseDetails: undefined, caseMonitoringCodes: undefined });
  return true;
};

const tryHandleCaseDetailsFromHandover = (
  caseIdentifiers: CaseIdentifiers,
  { register, mergeTags, get }: Pick<Parameters<SubscriptionFactory>[0], "register" | "mergeTags" | "get">,
) => {
  const caseId = Number(caseIdentifiers.caseId);
  const handover = get("handover");
  const handoverForCase = handover?.found && handover.result.caseId === caseId ? handover.result : undefined;
  if (!handoverForCase?.caseDetails) return false;

  mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(handoverForCase.caseDetails).tags });
  register({ caseDetails: { found: true, result: handoverForCase.caseDetails } });
  if (handoverForCase.monitoringCodes) {
    register({ caseMonitoringCodes: { found: true, result: handoverForCase.monitoringCodes } });
  }
  return true;
};

const tryHandleDisabledDataAccess = (fetch: typeof globalThis.fetch | undefined) => !fetch;

const tryRetrieveCaseDetails = (
  caseIdentifiers: CaseIdentifiers,
  fetch: typeof globalThis.fetch,
  { showMonitoringCodes, setNextHandover, setNextRecentCases }: Props,
  { register, mergeTags }: Pick<Parameters<SubscriptionFactory>[0], "register" | "mergeTags">,
) => {
  const caseId = Number(caseIdentifiers.caseId);
  // Keep the calls and their registering separate as one may be slower than the other and the UI
  // may be able to render useful stuff with whatever it has first
  const caseDetailsPromise = fetchAndValidate(fetch, `/api/global-components/cases/${caseId}/summary`, CaseDetailsSchema)
    .then(caseDetails => {
      mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetails).tags });
      register({ caseDetails: { found: true, result: caseDetails } });
      return caseDetails;
    })
    .catch(error => {
      register({ caseDetails: { found: false, error } });
      return undefined;
    });

  const monitoringCodesPromise = !showMonitoringCodes
    ? Promise.resolve(undefined)
    : fetchAndValidate(fetch, `/api/global-components/cases/${caseId}/monitoring-codes?assignedOnly=true`, MonitoringCodesSchema)
      .then(caseMonitoringCodes => {
        register({ caseMonitoringCodes: { found: true, result: caseMonitoringCodes } });
        return caseMonitoringCodes;
      })
      .catch(error => {
        register({ caseMonitoringCodes: { found: false, error } });
        return undefined;
      });

  Promise.all([caseDetailsPromise, monitoringCodesPromise]).then(([caseDetails, monitoringCodes]) => {
    const handover = { caseId, caseDetails, monitoringCodes };
    setNextHandover(handover);
    register({ handover: { found: true, result: handover } });
    setNextRecentCases(caseDetails);
  });
};

export const caseDetailsSubscriptionFactory =
  (props: Props): SubscriptionFactory =>
  (args) => ({
    type: "onChange",
    handler: {
      propName: "caseIdentifiers",
      handler: caseIdentifiers =>
        tryHandleEmptyCaseIdentifiers(caseIdentifiers, args)
          || tryHandleCaseDetailsFromHandover(caseIdentifiers!, args)
          || tryHandleDisabledDataAccess(props.fetch)
          || tryRetrieveCaseDetails(caseIdentifiers!, props.fetch!, props, args),
    },
  });
