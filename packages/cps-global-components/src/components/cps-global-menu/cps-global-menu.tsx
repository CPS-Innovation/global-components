import { Component, h, Fragment } from "@stencil/core";
import { menuConfig } from "./menu-config/menu-config";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { renderError } from "../common/render-error";
import { WithLogging } from "../../logging/WithLogging";

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

    if (!FEATURE_FLAGS.shouldShowMenu(state)) {
      return null;
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

    const surveyLink = FEATURE_FLAGS.surveyLink(state);

    const shouldShowCaseDetails = FEATURE_FLAGS.shouldShowCaseDetails(state);

    const classes = FEATURE_FLAGS.shouldShowGovUkRebrand(state)
      ? { flag: "govuk-template--rebranded", level1Background: "background-light-blue", divider: "background-divider-blue" }
      : { flag: "", level1Background: "background-grey", divider: "background-divider" };

    return (
      <>
        <div class={classes.flag}>
          <nav class={`level level-1 ${classes.level1Background}`} aria-label="Menu" data-testid="menu-level-1">
            <ul>
              {level1Links?.map(link => (
                <nav-link {...link}></nav-link>
              ))}
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
              </ul>
            </nav>
            <div class={shouldShowCaseDetails ? "background-divider-content-width" : classes.divider}></div>
          </>
        )}
      </>
    );
  }
}
