import { Tags } from "../context/Tags";
import { CaseDetails, caseDetailsSafeToCacheFields } from "./CaseDetails";

export const extractTagsFromCaseDetails = (caseDetails: Partial<CaseDetails>): Tags =>
  caseDetailsSafeToCacheFields.reduce((acc, curr) => ({ ...acc, [curr]: caseDetails[curr] }), {});
