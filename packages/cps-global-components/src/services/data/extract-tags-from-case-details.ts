import { Tags } from "../context/Tags";
import { CaseDetails, caseDetailsTagFields } from "./CaseDetails";

export const extractTagsFromCaseDetails = (caseDetails: Partial<CaseDetails>): { allTagsArePresent: boolean; tags: Tags } => {
  const fieldsInCaseDetails = Object.keys(caseDetails);
  const allTagsArePresent = caseDetailsTagFields.every(field => fieldsInCaseDetails.includes(field));

  const tags = caseDetailsTagFields.reduce((acc, curr) => ({ ...acc, [curr]: caseDetails[curr] }), {});

  return { allTagsArePresent, tags };
};
