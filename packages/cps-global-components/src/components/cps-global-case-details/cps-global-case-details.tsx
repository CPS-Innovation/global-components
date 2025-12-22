import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { getCaseDefendantHeadline } from "../../services/data/get-case-defendant-headline";

@Component({
  tag: "cps-global-case-details",
  styleUrl: "cps-global-case-details.scss",
  shadow: false,
})
export class CpsGlobalCaseDetails {
  render() {
    const {
      isReady,
      state: { caseDetails, caseMonitoringCodes },
      // Let's have caseMonitoringCodes be lazy i.e. we will not hold up the UI for the
      //  caseMonitoringCodes call to have completed.
    } = readyState(["caseDetails"], ["caseMonitoringCodes"]);

    return (
      <>
        {isReady && (
          <div class="level case-details">
            <>
              {caseDetails.found && (
                <>
                  <div>{caseDetails.result.urn}</div>
                  <div>
                    <b>{getCaseDefendantHeadline(caseDetails.result)}</b>
                  </div>
                </>
              )}
              <div>
                {caseMonitoringCodes?.found && (
                  <>
                    {caseMonitoringCodes.result.map(({ code, description }) => (
                      <strong class="govuk-tag govuk-tag--red" key={code}>
                        {description}
                      </strong>
                    ))}
                  </>
                )}
              </div>
            </>
          </div>
        )}
      </>
    );
  }
}
