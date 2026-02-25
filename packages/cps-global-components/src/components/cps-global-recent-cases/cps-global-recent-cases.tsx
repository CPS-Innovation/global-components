import { Component, Prop, VNode, h } from "@stencil/core";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { WithLogging } from "../../logging/WithLogging";
import { readyState } from "../../store/store";
import { assertNever } from "../../utils/assert-never";

const processState = () => {
  const { isReady, state } = readyState(["config"], ["recentCases"]);

  // 1) If we  are not ready (!isReady) then we do not yet know if we are to show ourselves or not ...
  if (!isReady) {
    return { status: "not-yet-known" } as const;
  }

  const {
    recentCases,
    config: { RECENT_CASES_NAVIGATE_URL },
  } = state;

  // 2) ... because we do not have RECENT_CASES_NAVIGATE_URL. We use the presence of that value as
  //  a feature flag.
  if (!RECENT_CASES_NAVIGATE_URL) {
    return { status: "feature-off" } as const;
  }

  // 3) We know know we are showing ourselves. The next state to cater for is if we are still waiting
  //  on the API call to get recent cases. At the moment this is not a DB call and only uses cookies
  //  and so in practice should always be done by the time we first rendering anyway.
  if (!recentCases) {
    return { status: "api-still-waiting" } as const;
  }

  // 4) The api call has errored
  if (!recentCases.found) {
    return { status: "api-error" } as const;
  }

  // 5) We have response from the api but it is empty
  if (!recentCases.result.length) {
    return { status: "empty-data" } as const;
  }

  return { status: "have-data", data: recentCases.result, urlTemplate: RECENT_CASES_NAVIGATE_URL } as const;
};

const buildCaseLink = ({ caseId, urn, urlTemplate }: { caseId: number; urn: string | null; urlTemplate: string }) => replaceTagsInString(urlTemplate, { caseId, urn });

const withHeader = (content: VNode) => (
  <div class="recent-cases">
    <slot name="heading">
      <h3 class="govuk-heading-m">Recently viewed cases</h3>
    </slot>
    {content}
  </div>
);

@Component({
  tag: "cps-global-recent-cases",
  styleUrl: "cps-global-recent-cases.scss",
  shadow: true,
})
export class CpsGlobalRecentCases {
  @Prop() listClass: string = "govuk-list govuk-list--spaced";
  @Prop() itemClass: string = "";
  @Prop() linkClass: string = "govuk-link";
  @Prop() itemTextTemplate: string = "{urn} - {description}";

  @WithLogging("CpsGlobalRecentCases")
  render() {
    const state = processState();

    switch (state.status) {
      case "not-yet-known":
      case "feature-off":
        return null;
      case "api-still-waiting":
        return withHeader(<slot name="waiting"></slot>);
      case "api-error": // todo: do we need a specific error message?
      case "empty-data":
        return withHeader(
          <slot name="no-cases">
            <p class="govuk-body">As you start to use this service the cases that you have visited most recently will appear here.</p>
          </slot>,
        );
      case "have-data":
        return withHeader(
          <ul class={this.listClass}>
            {state.data.map(({ caseId, urn, description }) => (
              <li class={this.itemClass || undefined}>
                <a class={this.linkClass || undefined} href={buildCaseLink({ caseId, urn, urlTemplate: state.urlTemplate })}>
                  {replaceTagsInString(this.itemTextTemplate, { caseId, urn, description })}
                </a>
              </li>
            ))}
          </ul>,
        );
      default:
        return assertNever(state);
    }
  }
}
