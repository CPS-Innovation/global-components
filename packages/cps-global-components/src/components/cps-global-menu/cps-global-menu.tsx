import { Component, h, Fragment } from "@stencil/core";
import { menuConfig } from "./menu-config/menu-config";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { renderError } from "../common/render-error";
import { WithLogging } from "../../logging/WithLogging";
import { dispatchCmsNavigate } from "../../services/navigate-cms/initialise-navigate-cms";

@Component({
  tag: "cps-global-menu",
  styleUrl: "cps-global-menu.scss",
  shadow: false,
})
export class CpsGlobalMenu {
  @WithLogging("CpsGlobalMenu")
  render() {
    const { isReady, state } = readyState(["config", "tags", "flags", "context", "cmsSessionHint", "preview"], ["auth"]);
    if (!isReady) {
      return null; // don't show menu until we are ready
    }

    const menuShowStatus = FEATURE_FLAGS.shouldShowMenu(state);

    if (menuShowStatus === "hide-menu") {
      return null;
    } else if (menuShowStatus === "show-hint") {
      return (
        <div style={{ marginTop: "1rem" }}>
          <cps-gds-notification-banner dismissKey="qa-no-menu-hint-1" title-text="Feature flags in QA">
            <p class="govuk-body">
              When using the Casework App, the global navigation menu is only visible to users who are in one of the programme's designated feature flag AD/Entra groups. Please
              arrange to be added to one of these groups if you want to see the menu on this page.
            </p>
            <p class="govuk-body">This message only appears in the QA environment. In production, the menu will not be visible and this notification will not appear.</p>
          </cps-gds-notification-banner>
        </div>
      );
    }
    const menu = menuConfig(state);

    if (menu.status === "error") {
      return renderError(menu.error);
    }

    const {
      links: [level1Links, level2Links],
    } = menu;

    // Design decision: if there are no links (we only need to check for top-level links)
    //  then we will take this as an address where the menu should not be shown
    if (!level1Links?.length) {
      return null;
    }

    const reportIssueLink = FEATURE_FLAGS.reportIssueLink(state);
    const surveyLink = FEATURE_FLAGS.surveyLink(state);
    const shouldShowCaseDetails = FEATURE_FLAGS.shouldShowCaseDetails(state);
    const shouldShowOpenCaseInCms = FEATURE_FLAGS.shouldShowOpenCaseInCms(state);
    const caseId = state.tags?.caseId ? Number(state.tags.caseId) : undefined;

    const classes = FEATURE_FLAGS.shouldShowGovUkRebrand(state)
      ? { level1Background: "background-light-blue", divider: "background-divider-blue" }
      : { level1Background: "background-grey", divider: "background-divider" };

    return (
      <>
        <div>
          <nav class={`level level-1 ${classes.level1Background}`} aria-label="Menu" data-testid="menu-level-1">
            <ul>
              {level1Links?.map(link => (
                <nav-link {...link}></nav-link>
              ))}
              {reportIssueLink.showLink && <nav-link openInNewTab class="report-issue-link" label="Report an issue" href={reportIssueLink.url}></nav-link>}
              {surveyLink.showLink && <nav-link openInNewTab class="survey-link" label="Give feedback" href={surveyLink.url}></nav-link>}
            </ul>
          </nav>
        </div>
        <div class={classes.divider}></div>

        {shouldShowCaseDetails && <cps-global-case-details></cps-global-case-details>}

        {!!level2Links?.length && (
          <>
            <nav class="level level-2" aria-label="Sub-menu" data-testid="menu-level-2">
              <ul>
                {level2Links.map(link => (
                  <nav-link {...link}></nav-link>
                ))}
                {shouldShowOpenCaseInCms && caseId && (
                  <li class="inline-link open-in-cms">
                    <button class="linkButton" onClick={() => dispatchCmsNavigate(caseId)}>
                      Open in CMS
                    </button>
                  </li>
                )}
              </ul>
            </nav>
            <div class={shouldShowCaseDetails ? "background-divider-content-width" : classes.divider}></div>
          </>
        )}
      </>
    );
  }
}
