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
      state: { caseIdentifiers, tags, caseDetails, caseMonitoringCodes, preview, settings },
    } = readyState(["tags", "caseIdentifiers", "preview", "settings"], ["caseDetails", "caseMonitoringCodes"]);

    if (!caseIdentifiers?.caseId) {
      // We are not on a case-specific page, or we do not have caseId yet
      return null;
    }

    // If there is a urn in our tags then use that while case details are being obtained
    const urn = caseDetails?.result?.urn || tags.urn;
    const headline = caseDetails?.result && getCaseDefendantHeadline(caseDetails.result);
    const monitoringCodes = caseMonitoringCodes?.result || [];

    // hack for demo
    const pageBackgroundColourStyles = { backgroundColor: !!preview?.result?.accessibility && !!settings?.result?.accessibilityBackground ? "#f3f2f1" : "#ffffff" };

    return preview.result?.caseMarkers === "b" ? (
      <div class="level case-details" style={pageBackgroundColourStyles}>
        <div class="govuk-body-m" style={{ marginBottom: "0" }}>
          <b>{headline}</b>
        </div>

        <div style={{ marginBottom: "-5px" }}>{urn}</div>
        <div class="scrolling-tags">
          <div class="scrolling-tags-container">
            {/* Let's only show monitoring codes once we have the headline, otherwise 
                we get layout stuttering as the values come in  */}
            {headline &&
              monitoringCodes.map(({ code, description }) => (
                <strong class="govuk-tag govuk-tag--red" key={code}>
                  {description}
                </strong>
              ))}
          </div>
        </div>
      </div>
    ) : (
      <div class="level case-details" style={pageBackgroundColourStyles}>
        <div>{urn}</div>
        <div>
          <b>{headline}</b>
        </div>
        <div class="scrolling-tags">
          <div class="scrolling-tags-container">
            {/* Let's only show monitoring codes once we have the headline, otherwise 
                we get layout stuttering as the values come in  */}
            {headline &&
              monitoringCodes.map(({ code, description }) => (
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
