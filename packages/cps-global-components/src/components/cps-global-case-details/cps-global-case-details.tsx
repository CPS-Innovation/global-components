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
      state: { caseDetails, caseMonitoringCodes },
    } = readyState([], ["caseDetails", "caseMonitoringCodes"]);

    return (
      <>
        {(caseDetails || caseMonitoringCodes) && (
          <div class="level case-details">
            <>
              {caseDetails?.found && (
                <>
                  <div>{caseDetails.result.urn}</div>
                  <div>
                    <b>{getCaseDefendantHeadline(caseDetails.result)}</b>
                  </div>
                </>
              )}
              {caseMonitoringCodes && (
                <div>
                  {caseMonitoringCodes.found && (
                    <>
                      {caseMonitoringCodes.result.map(({ code, description }) => (
                        <strong class="govuk-tag govuk-tag--red" key={code}>
                          {description}
                        </strong>
                      ))}
                    </>
                  )}
                </div>
              )}
            </>
          </div>
        )}
      </>
    );
  }
}
