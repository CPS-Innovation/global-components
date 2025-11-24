import { validateCaseDetailsResponse } from "./validate-case-details-response";

export const getCaseDetailsFactory = (fetchFn: typeof fetch) => (caseId: string) => fetchFn(`/cases/${caseId}/summary`).then(validateCaseDetailsResponse);
