import { CaseDetailsSchema } from "./CaseDetails";
import { extractTagsFromCaseDetails } from "./extract-tags-from-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Handover } from "../handover/Handover";
import { Result } from "../../utils/Result";
import { fetchAndValidate } from "../api/fetch-and-validate";
import { MonitoringCodesSchema } from "./MonitoringCode";

type Props = {
  handover: Result<Handover>;
  setNextHandover: (data: Handover) => void;
  fetch: typeof fetch;
};

export const caseDetailsSubscriptionFactory =
  ({ fetch, handover, setNextHandover }: Props): SubscriptionFactory =>
  ({ register, mergeTags }) => ({
    type: "onChange",
    handler: {
      propName: "caseIdentifiers",
      handler: caseIdentifiers => {
        if (!caseIdentifiers) {
          register({ caseDetails: undefined, caseMonitoringCodes: undefined });
          return;
        }
        const caseId = Number(caseIdentifiers.caseId);

        // If we have this case's details handed over then we do not have to hit the apis
        const { caseDetails, monitoringCodes } = (handover.found && handover.result.caseId === caseId && handover.result) || {};

        // Let's keep the calls and their registering separate as one may be slower than the other and the UI
        // may be able to render useful stuff with whatever it has first
        const caseDetailsPromise = (caseDetails ? Promise.resolve(caseDetails) : fetchAndValidate(fetch, `/api/global-components/cases/${caseId}/summary`, CaseDetailsSchema))
          .then(caseDetails => {
            mergeTags({ caseDetailsTags: extractTagsFromCaseDetails(caseDetails).tags });
            register({ caseDetails: { found: true, result: caseDetails } });
            return caseDetails;
          })
          .catch(error => {
            register({ caseDetails: { found: false, error } });
            return undefined;
          });

        const monitoringCodesPromise = (
          monitoringCodes
            ? Promise.resolve(monitoringCodes)
            : fetchAndValidate(fetch, `/api/global-components/cases/${caseId}/monitoring-codes?assignedOnly=true`, MonitoringCodesSchema)
        )
          .then(caseMonitoringCodes => {
            register({ caseMonitoringCodes: { found: true, result: caseMonitoringCodes } });
            return caseMonitoringCodes;
          })
          .catch(error => {
            register({ caseMonitoringCodes: { found: false, error } });
            return undefined;
          });

        Promise.all([caseDetailsPromise, monitoringCodesPromise]).then(([caseDetails, monitoringCodes]) => {
          setNextHandover({ caseId, caseDetails, monitoringCodes });
        });
      },
    },
  });
