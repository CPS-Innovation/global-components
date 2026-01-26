import { Tags } from "../tags/Tags";

export type CaseIdentifiers = {
  caseId: string;
};

export const caseIdentifierKeys = ["caseId"] as const;

const isCaseIdentifiers = (tags: Tags | undefined): tags is CaseIdentifiers => tags !== undefined && "caseId" in tags && typeof tags.caseId === "string";

export const extractCaseIdentifiers = (tags: Tags | undefined) =>
  isCaseIdentifiers(tags)
    ? caseIdentifierKeys.reduce((acc, curr) => {
        acc[curr] = tags[curr];
        return acc;
      }, {} as CaseIdentifiers)
    : undefined;
