import { Tags } from "../context/Tags";
import { CaseDetails } from "./CaseDetails";

const caseDetailsTags = ["urn", "isDcf"] as (keyof CaseDetails)[];

export const extractTagsFromCaseDetails = (caseDetails: Partial<CaseDetails>): Tags => caseDetailsTags.reduce((acc, curr) => ({ ...acc, [curr]: caseDetails[curr] }), {});
