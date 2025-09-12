import { caseIdentifierKeys } from "./CaseIdentifiers";
import { FoundContext } from "./find-context";

export type ContextType = "unknown" | "not-case" | "case-details";

export const getContextType = (context: FoundContext): ContextType => {
  // Design decision: this might prove to be a bit simplistic, but lets say a context is
  //  case-relevant if it has tags that it is looking for.
  return !context.found
    ? "unknown"
    : // Either tags sought for in the DOM...
    !!context.domTags?.length ||
      // ... or regex groups in the paths string mean that this is a case
      context.paths.some(path => caseIdentifierKeys.some(key => path.includes(`<${key}>`)))
    ? "case-details"
    : "not-case";
};
