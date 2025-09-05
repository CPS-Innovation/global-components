import { SubscriptionFactory } from "../../store/store";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails } from "./get-case-details";
import { CaseDetails } from "./types";

export const getCaseDetailsSubscription =
  (callback: ({ caseDetails }: { caseDetails: CaseDetails }) => void): SubscriptionFactory =>
  () => ({
    set: (key, newValue) => {
      if (key === "caseIdentifiers") {
        const identifiers = newValue as CaseIdentifiers;
        if (identifiers) {
          getCaseDetails(identifiers).then(caseDetails => callback({ caseDetails }));
        }
      }
    },
  });
