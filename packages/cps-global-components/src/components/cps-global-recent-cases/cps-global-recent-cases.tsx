import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";

@Component({
  tag: "cps-global-recent-cases",
  styleUrl: "cps-global-recent-cases.scss",
  shadow: true,
})
export class CpsGlobalRecentCases {
  render() {
    const {
      isReady,
      state: {
        recentCases,
        config: { RECENT_CASES_NAVIGATE_URL },
      },
      // Let's have caseMonitoringCodes be lazy i.e. we will not hold up the UI for the
      //  caseMonitoringCodes call to have completed.
    } = readyState("recentCases", "tags", "config");

    if (!(isReady && recentCases.found && RECENT_CASES_NAVIGATE_URL)) {
      return null;
    }

    const buildCaseLink = ({ caseId, urn }: { caseId: number; urn: string }) => replaceTagsInString(RECENT_CASES_NAVIGATE_URL, { caseId, urn });

    return (
      <>
        <h3 class="govuk-heading-m">Your recent cases</h3>
        <div class="recent-cases govuk-list">
          <ul>
            {recentCases.result.map(({ caseId, urn, description }) => (
              <li>
                <a class="govuk-link" href={buildCaseLink({ caseId, urn })}>
                  {urn} - {description}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }
}
