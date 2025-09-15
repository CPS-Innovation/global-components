import { SubscriptionFactory } from "../../store/store";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { getCaseDetails } from "./get-case-details";

export const getCaseDetailsSubscription: SubscriptionFactory = ({ registerToStore }) => ({
  set: (key, newValue) => {
    if (key === "caseIdentifiers" && newValue) {
      getCaseDetails(newValue as CaseIdentifiers).then(caseDetails => registerToStore({ caseDetails }));
    }
  },
});
