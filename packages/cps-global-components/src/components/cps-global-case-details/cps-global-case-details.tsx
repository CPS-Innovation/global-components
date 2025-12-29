import { Component, h } from "@stencil/core";
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
      state: { caseIdentifiers, tags, caseDetails, caseMonitoringCodes },
    } = readyState(["tags", "caseIdentifiers"], ["caseDetails", "caseMonitoringCodes"]);

    if (!caseIdentifiers?.caseId) {
      return null;
    }

    const urn = caseDetails?.result?.urn || tags.urn;
    const headline = caseDetails?.result && getCaseDefendantHeadline(caseDetails.result);
    const monitoringCodes = caseMonitoringCodes?.result || [];

    return (
      <div class="level case-details">
        <div>{urn}</div>
        <div>
          <b>{headline}</b>
        </div>

        <div class="scrolling-tags">
          <div class="scrolling-tags-container">
            {monitoringCodes.map(({ code, description }) => (
              <strong class="govuk-tag govuk-tag--red" key={code}>
                {description}
              </strong>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
