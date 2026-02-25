import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";
import { CaseDetails } from "../../data/CaseDetails";
import { getCaseDefendantHeadline } from "../../data/get-case-defendant-headline";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { RecentCase, RecentCasesSchema } from "./recent-cases";
import { Register } from "../../../store/store";

export const initialiseRecentCases = async ({ rootUrl, register }: { rootUrl: string; preview: Result<Preview>; register: Register }) => {
  const recentCasesPromise = fetchState({ rootUrl, url: "../state/recent-cases", schema: RecentCasesSchema });

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
        data: [nextEntry, ...recentCasesList.filter(c => c.caseId !== nextEntry.caseId)].slice(0, 10),
      });
    });
  };
  return { setNextRecentCases };
};
