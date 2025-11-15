import { Register } from "../../store/store";
import { extractCaseIdentifiersIfChanged } from "../context/extract-case-identifiers-if-changed";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails, GetCaseDetailsProps } from "./get-case-details";
import { SubscriptionFactory } from "../../store/subscriptions/SubscriptionFactory";
import { Tags } from "@microsoft/applicationinsights-web";
import { GetToken } from "../auth/GetToken";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { makeConsole } from "../../logging/makeConsole";
import { FoundContext } from "../context/FoundContext";

let cachedCaseIdentifier: CaseIdentifiers | undefined = undefined;

const { _debug } = makeConsole("getCaseDetailsSubscriptionFactory");

export const getCaseDetailsSubscriptionFactory =
  ({
    register,
    getToken,
    config,
    context,
    correlationIds,
    window,
  }: {
    register: Register;
    getToken: GetToken;
    config: GetCaseDetailsProps["config"];
    context: FoundContext;
    correlationIds: CorrelationIds;
    window: Window;
  }): SubscriptionFactory =>
  () => ({
    // Trigger on register as the store may have the tags prior to being registered,
    //  and hence no onchange event wil happen in order to run this logic
    triggerSetOnRegister: { key: "tags" },
    subscription: {
      set: (key, newValue) => {
        if (key === "tags") {
          const caseIdentifiers = extractCaseIdentifiersIfChanged(cachedCaseIdentifier, newValue as Tags);
          _debug("getCaseDetailsSubscription", "caseIdentifiers", caseIdentifiers);
          if (caseIdentifiers) {
            cachedCaseIdentifier = caseIdentifiers;
            getCaseDetails({ window, caseIdentifiers, getToken, config, context, correlationIds }).then(caseDetails => register({ caseDetails }));
          }
        }
      },
    },
  });
