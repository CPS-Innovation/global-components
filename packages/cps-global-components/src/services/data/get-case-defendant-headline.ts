import { CaseDetails } from "./CaseDetails";

export const getCaseDefendantHeadline = ({ leadDefendantSurname, leadDefendantFirstNames, numberOfDefendants }: CaseDetails) =>
  `${leadDefendantSurname}, ${leadDefendantFirstNames} ${
    numberOfDefendants === 2 ? " and 1 other" : numberOfDefendants > 2 ? " and " + (numberOfDefendants - 1) + " others" : ""
  }`.trimEnd();
