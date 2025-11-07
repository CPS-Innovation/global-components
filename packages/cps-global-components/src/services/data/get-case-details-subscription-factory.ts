import { Register } from "../../store/store";
import { extractCaseIdentifiersIfChanged } from "../context/extract-case-identifiers-if-changed";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails, GetCaseDetailsProps } from "./get-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Tags } from "@microsoft/applicationinsights-web";
import { GetToken } from "../auth/GetToken";
import { CorrelationIds } from "../correlation/CorrelationIds";

let cachedCaseIdentifier: CaseIdentifiers | undefined = undefined;

export const getCaseDetailsSubscriptionFactory =
  ({
    register,
    getToken,
    config,
    correlationIds,
  }: {
    register: Register;
    getToken: GetToken;
    config: GetCaseDetailsProps["config"];
    correlationIds: CorrelationIds;
  }): SubscriptionFactory =>
  () => ({
    set: (key, newValue) => {
      if (key === "tags") {
        const caseIdentifiers = extractCaseIdentifiersIfChanged(cachedCaseIdentifier, newValue as Tags);
        if (caseIdentifiers) {
          cachedCaseIdentifier = caseIdentifiers;
          getCaseDetails({ caseIdentifiers, getToken, config, correlationIds }).then(caseDetails => register({ caseDetails }));
        }
      }
    },
  });
