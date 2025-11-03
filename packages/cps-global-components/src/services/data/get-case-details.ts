import { withLogging } from "../../logging/with-logging";
import { CaseIdentifiers } from "../context/CaseIdentifiers";
import { CaseDetails } from "./types";

const getCaseDetailsInternal = async ({ caseId }: CaseIdentifiers) => {
  await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  return { caseId: +caseId, urn: String(new Date()), isDcf: false } as CaseDetails;
};

export const getCaseDetails = withLogging("getCaseDetails", getCaseDetailsInternal);
