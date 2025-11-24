import { validateCaseDetailsResponse } from "./validate-case-details-response";

export const getCaseDetails = async (caseId: string, fetchFn: typeof fetch) => fetchFn(`/cases/${caseId}/summary`).then(validateCaseDetailsResponse);
