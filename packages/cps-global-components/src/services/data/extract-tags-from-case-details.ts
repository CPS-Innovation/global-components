import { Tags } from "../context/Tags";
import { CaseDetails } from "./CaseDetails";

const caseDetailsTags: (keyof CaseDetails)[] = ["urn", "isDcfCase"];

export const extractTagsFromCaseDetails = (caseDetails: Partial<CaseDetails>): Tags => caseDetailsTags.reduce((acc, curr) => ({ ...acc, [curr]: caseDetails[curr] }), {});
