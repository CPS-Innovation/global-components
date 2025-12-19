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
      isReady,
      state: { caseDetails },
    } = readyState("caseDetails");

    return (
      <>
        <div class="level govuk-body case-details">
          {isReady && (
            <>
              <div>{caseDetails.urn}</div>
              <div>
                <b>Natasha Frost and 2 more</b>
              </div>
              <div>
                <strong class="govuk-tag govuk-tag--red">Custody time limit</strong>
              </div>
            </>
          )}
        </div>
      </>
    );
  }
}
