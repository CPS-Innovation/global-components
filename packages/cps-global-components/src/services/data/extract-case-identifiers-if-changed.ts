import { caseIdentifierKeys, CaseIdentifiers } from "../context/CaseIdentifiers";
import { Tags } from "../context/Tags";

const isCaseIdentifiers = (tags: Tags): tags is CaseIdentifiers => "caseId" in tags && typeof tags.caseId === "string";

export const extractCaseIdentifiersIfChanged = (existingIdentifiers: CaseIdentifiers | undefined, newIdentifiers: Tags) => {
  const areFreshCaseIdentifiers = isCaseIdentifiers(newIdentifiers) && !caseIdentifierKeys.every(key => existingIdentifiers?.[key] === newIdentifiers[key]);
  if (!areFreshCaseIdentifiers) {
    return false;
  }

  return caseIdentifierKeys.reduce((acc, curr) => {
    acc[curr] = newIdentifiers[curr];
    return acc;
  }, {} as CaseIdentifiers);
};
