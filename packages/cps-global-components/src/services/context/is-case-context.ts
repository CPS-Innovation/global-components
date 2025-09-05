import { Context } from "cps-global-configuration/dist/schema";
import { caseIdentifierKeys } from "./CaseIdentifiers";

export const isCaseContext = (context: Context) =>
  // Design decision: this might prove to be a bit simplistic, but lets say a context is
  //  case-relevant if it has tags that it is looking for.
  // Either tags sought for in the DOM
  !!context.domTags?.length ||
  //  or regex groups in the paths string
  context.paths.some(path => caseIdentifierKeys.some(key => path.includes(`<${key}>`)));
