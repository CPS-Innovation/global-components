import { extractCaseIdentifiers } from "../../services/context/CaseIdentifiers";
import { SubscriptionFactory } from "./SubscriptionFactory";

export const caseIdentifiersSubscriptionFactory: SubscriptionFactory = ({ register }) => ({
  type: "onChange",
  handler: {
    propName: "tags",
    handler: tags => register({ caseIdentifiers: extractCaseIdentifiers(tags) }),
  },
});
