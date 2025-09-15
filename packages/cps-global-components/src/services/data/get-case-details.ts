import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { CaseDetails } from "./types";

export const getCaseDetails = async ({ caseId }: CaseIdentifiers) => {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  return { caseId: +caseId, urn: String(new Date()), isDcf: false } as CaseDetails;
};
