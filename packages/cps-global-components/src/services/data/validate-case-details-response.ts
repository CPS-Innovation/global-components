import { CaseDetails, CaseDetailsSchema } from "./CaseDetails";

export const validateCaseDetailsResponse = async (response: Response) => {
  if (!response.ok) {
    throw new Error("case details returned non-ok status code");
  }

  const data = await response.json();
  const result = CaseDetailsSchema.safeParse(data);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.data as CaseDetails;
};
