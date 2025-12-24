import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";

@Component({
  tag: "cps-global-recent-cases",
  styleUrl: "cps-global-recent-cases.scss",
  shadow: true,
})
export class CpsGlobalRecentCases {
  render() {
    const {
      isReady,
      state: { recentCases },
      // Let's have caseMonitoringCodes be lazy i.e. we will not hold up the UI for the
      //  caseMonitoringCodes call to have completed.
    } = readyState("recentCases");

    return (
      <>
        <h2>Recent cases</h2>
        {isReady && recentCases.found && (
          <div class="recent-cases">
            <ul>
              {recentCases.result.map(({ caseId, urn, description }) => (
                <li>
                  <a href={`/${caseId}`}>
                    {urn} - {description}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }
}
