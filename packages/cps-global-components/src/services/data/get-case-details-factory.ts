import { validateCaseDetailsResponse } from "./validate-case-details-response";

export const getCaseDetailsFactory = (fetchFn: typeof fetch) => async (caseId: string) => {
  const response = await fetchFn(`/cases/${caseId}/summary`);
  return validateCaseDetailsResponse(response);
};
