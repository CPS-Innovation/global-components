import { SubscriptionFactory } from "../../store/store";
import { extractCaseIdentifiersIfChanged } from "../context/extract-case-identifiers-if-changed";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails } from "./get-case-details";
import { Tags } from "../context/Tags";

let cachedCaseIdentifier: CaseIdentifiers | undefined = undefined;

export const getCaseDetailsSubscription: SubscriptionFactory = ({ registerToStore }) => ({
  set: (key, newValue) => {
    if (key === "domTags") {
      const freshCaseIdentifiers = extractCaseIdentifiersIfChanged(cachedCaseIdentifier, newValue as Tags);
      if (freshCaseIdentifiers) {
        cachedCaseIdentifier = freshCaseIdentifiers;
        getCaseDetails(freshCaseIdentifiers).then(caseDetails => registerToStore({ caseDetails }));
      }
    }
  },
});
