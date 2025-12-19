import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";

@Component({
  tag: "cps-global-case-details",
  styleUrl: "cps-global-case-details.scss",
  shadow: false,
})
export class CpsGlobalCaseDetails {
  render() {
    const {
      state: {
        caseDetails: { found: caseDetailsFound, result: caseDetails },
        caseMonitoringCodes: { found: monitoringCodesFound, result: monitoringCodes },
      },
    } = readyState([], ["caseDetails", "caseMonitoringCodes"]);

    return (
      <>
        {(caseDetailsFound || monitoringCodesFound) && (
          <div class="level case-details">
            <>
              {caseDetailsFound && (
                <>
                  <div>{caseDetails.urn}</div>
                  <div>
                    <b>
                      {caseDetails.leadDefendantSurname}, {caseDetails.leadDefendantFirstNames}
                    </b>
                  </div>
                </>
              )}
              {monitoringCodesFound && (
                <div>
                  {monitoringCodes.map(({ code, description }) => (
                    <strong class="govuk-tag govuk-tag--red" key={code}>
                      {description}
                    </strong>
                  ))}
                </div>
              )}
            </>
          </div>
        )}
      </>
    );
  }
}
