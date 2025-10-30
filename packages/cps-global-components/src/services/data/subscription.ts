import { isATagProperty, SubscriptionFactory } from "../../store/store";
import { extractCaseIdentifiersIfChanged } from "../context/extract-case-identifiers-if-changed";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails } from "./get-case-details";

let cachedCaseIdentifier: CaseIdentifiers | undefined = undefined;

export const getCaseDetailsSubscription: SubscriptionFactory = ({ register, getTags }) => ({
  set: key => {
    if (isATagProperty(key)) {
      const freshCaseIdentifiers = extractCaseIdentifiersIfChanged(cachedCaseIdentifier, getTags());
      if (freshCaseIdentifiers) {
        cachedCaseIdentifier = freshCaseIdentifiers;
        getCaseDetails(freshCaseIdentifiers).then(caseDetails => register({ caseDetails }));
      }
    }
  },
});
