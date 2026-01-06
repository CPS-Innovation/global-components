import { Preview } from "cps-global-configuration";
import { Result } from "../../../utils/Result";
import { CaseDetails } from "../../data/CaseDetails";
import { getCaseDefendantHeadline } from "../../data/get-case-defendant-headline";
import { fetchState } from "../fetch-state";
import { StatePutResponseSchema } from "../StatePutResponse";
import { RecentCase, RecentCases, RecentCasesSchema } from "./recent-cases";
import { ApplicationFlags } from "../../application-flags/ApplicationFlags";

export const initialiseRecentCases = async ({ rootUrl, preview, flags }: { rootUrl: string; preview: Result<Preview>; flags?: ApplicationFlags }) => {
  if (flags?.isLocalDevelopment) {
    return {
      recentCases: { found: true, result: [{ caseId: 1, urn: "12AB1212121", description: "Smith plus 2" }] } as Result<RecentCases>,
      setNextRecentCases: (() => {}) as (caseDetails: CaseDetails | undefined) => void,
    };
  }

  if (!(preview.found && preview.result.myRecentCases)) {
    return { recentCases: { found: false, error: new Error("Recent cases not enabled") } as Result<RecentCases>, setNextRecentCases: () => {} };
  }
  const recentCases = await fetchState({ rootUrl, url: "../state/recent-cases", schema: RecentCasesSchema });

  const setNextRecentCases = (caseDetails: CaseDetails | undefined) => {
    if (!caseDetails) {
      return;
    }
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
  };
  return { recentCases, setNextRecentCases };
};
