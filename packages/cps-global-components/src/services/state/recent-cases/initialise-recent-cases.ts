import { Config } from "cps-global-configuration";
import { CaseDetails } from "../../data/CaseDetails";
import { getCaseDefendantHeadline } from "../../data/get-case-defendant-headline";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { RecentCase, RecentCasesSchema } from "./recent-cases";
import { Register } from "../../../store/store";

export const initialiseRecentCases = async ({ rootUrl, register, config }: { rootUrl: string; register: Register; config: Config }) => {
  const { RECENT_CASES_LIST_LENGTH } = config;

  if (!RECENT_CASES_LIST_LENGTH) {
    return { setNextRecentCases: () => {} };
  }

  const recentCasesPromise = fetchState({ rootUrl, url: "../state/recent-cases", schema: RecentCasesSchema, defaultResultWhenNull: [] })
    // edge case: if we have reduced the RECENT_CASES_LIST_LENGTH setting and the user has accumulated a list longer than
    //  the new setting lets make sure the setting is respected immediately.
    .then(result => (result.found ? { ...result, result: result.result.slice(0, RECENT_CASES_LIST_LENGTH) } : result));

  recentCasesPromise.then(recentCases => {
    register({ recentCases });
  });

  const setNextRecentCases = (caseDetails: CaseDetails | undefined) => {
    if (!caseDetails) {
      return;
    }

    recentCasesPromise.then(recentCases => {
      const recentCasesList = recentCases.found ? recentCases.result : [];
      const nextEntry: RecentCase = { caseId: caseDetails.id, urn: caseDetails.urn, description: getCaseDefendantHeadline(caseDetails) };
      if (recentCasesList.length && JSON.stringify(recentCasesList[0]) === JSON.stringify(nextEntry)) {
        return;
      }

      fetchState({
        rootUrl,
        url: "../state/recent-cases",
        schema: StatePutResponseSchema,
        data: [nextEntry, ...recentCasesList.filter(c => c.caseId !== nextEntry.caseId)].slice(0, RECENT_CASES_LIST_LENGTH),
      });
    });
  };
  return { setNextRecentCases };
};
