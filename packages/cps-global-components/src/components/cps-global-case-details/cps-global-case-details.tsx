import { Component, h } from "@stencil/core";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { readyState } from "../../store/store";
import { getCaseDefendantHeadline } from "../../services/data/get-case-defendant-headline";
import { httpStatus } from "../../services/fetch/fetch-and-validate";

@Component({
  tag: "cps-global-case-details",
  styleUrl: "cps-global-case-details.scss",
  shadow: false,
})
export class CpsGlobalCaseDetails {
  render() {
    const ready = readyState(["tags", "caseIdentifiers", "preview", "config"], ["caseDetails", "caseMonitoringCodes"]);
    const {
      state: { caseIdentifiers, tags, caseDetails, caseMonitoringCodes },
    } = ready;

    if (!caseIdentifiers?.caseId) {
      // We are not on a case-specific page, or we do not have caseId yet
      return null;
    }

    // A 403 from the case-details endpoint means the user is not entitled to view this
    // case. First-pass treatment: keep the row (so the menu layout and dividers are
    // unaffected) but hide its content. UI/UX will advise on the final experience.
    if (caseDetails?.found === false && httpStatus(caseDetails.error) === 403) {
      return <div class="level case-details"></div>;
    }

    // If there is a urn in our tags then use that while case details are being obtained
    const urn = caseDetails?.result?.urn || tags.urn;
    const headline = caseDetails?.result && getCaseDefendantHeadline(caseDetails.result);

    const monitoringCodes = caseMonitoringCodes?.result || [];

    return FEATURE_FLAGS.shouldShowCaseDetails(ready.state) === "b" ? (
      <div class="level case-details">
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
      <div class="level case-details">
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
