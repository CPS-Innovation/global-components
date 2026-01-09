import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { WithLogging } from "../../logging/WithLogging";
import { SkipLink } from "../common/SkipLink";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { getArtifactUrl } from "../../utils/get-artifact-url";

@Component({
  tag: "cps-global-banner",
  styleUrl: "cps-global-banner.scss",
  shadow: false,
})
export class CpsGlobalBanner {
  @WithLogging("CpsGlobalBanner")
  render() {
    const { isReady, state } = readyState(["config", "flags", "context", "preview", "rootUrl"], ["recentCases"]);

    const resolveValues = () => {
      if (state.fatalInitialisationError) {
        // If there is an error we still want to show our branding.
        //  Use suitable fallback values
        return { showBanner: true, showAccessibilityOption: false, showGovUkRebrand: false, showRecentCases: false, href: "" };
      } else if (!isReady) {
        // Otherwise, we are not ready to show anything until our required state is ready
        //  so that we avoid e.g. flashes of incorrect styling
        return { showBanner: false, showAccessibilityOption: false, showGovUkRebrand: false, showRecentCases: false, href: "" };
      } else {
        // Out state is ready
        const showAccessibilityOption = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
        const showGovUkRebrand = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
        const showRecentCases = FEATURE_FLAGS.shouldShowRecentCases(state);
        return { showBanner: true, showAccessibilityOption, showGovUkRebrand, showRecentCases, href: state.config.BANNER_TITLE_HREF };
      }
    };

    const { showBanner, showGovUkRebrand, href, showAccessibilityOption, showRecentCases } = resolveValues();
    if (!showBanner) {
      return <></>;
    }

    const { templateCssClass, backgroundColourClass, dividerCssClass, recentCasesStyles } = showGovUkRebrand
      ? { templateCssClass: "govuk-template--rebranded", backgroundColourClass: "background-blue", dividerCssClass: "", recentCasesStyles: { marginTop: "10px" } }
      : { templateCssClass: "", backgroundColourClass: "background-black", dividerCssClass: "header-divider", recentCasesStyles: { marginTop: "-5px" } };

    const handleChange = (event: Event) => {
      const caseId = Number((event.target as HTMLSelectElement).value);
      const { urn } = state.recentCases?.result?.find(recentCase => recentCase.caseId === caseId) || {};
      if (!state.config.RECENT_CASES_NAVIGATE_URL || !urn) {
        return;
      }
      const nextUrl = replaceTagsInString(state.config.RECENT_CASES_NAVIGATE_URL, { caseId, urn });
      window.location.assign(nextUrl);
    };

    const truncate = (str: string, max = 10) => (str.length > max ? str.slice(0, max) + "..." : str);

    return (
      <>
        <div class={templateCssClass}>
          <SkipLink href="#main-content" class="govuk-skip-link skip-link" data-module="govuk-skip-link" {...state.context}>
            Skip to main content
          </SkipLink>
          <header class={`govuk-header govuk-header--with-js-navigation ${backgroundColourClass}`} data-module="govuk-header" data-govuk-header-init="">
            <div class="govuk-header__container" style={{ display: "flex", flexDirection: "row" }}>
              <div class="govuk-header__logo">
                <a href={href} class="govuk-header__link govuk-header__link--homepage">
                  <span class="govuk-!-font-weight-bold"> CPS </span>
                </a>
              </div>

              <div style={{ marginLeft: "auto", display: "flex", gap: "2rem" }}>
                {showAccessibilityOption && (
                  <div>
                    <nav aria-label="Menu" class="govuk-header__navigation govuk-header__navigation--end">
                      <ul id="navigation" class="govuk-header__navigation-list">
                        <li class="govuk-header__navigation-item">
                          <a class="govuk-header__link" href={getArtifactUrl(state.rootUrl, "accessibility/")}>
                            Accessibility
                          </a>
                        </li>
                      </ul>
                    </nav>
                  </div>
                )}

                {showRecentCases && state.recentCases?.result?.length && (
                  <div style={recentCasesStyles}>
                    <select class="govuk-select" onChange={handleChange} style={{ border: "1px solid #fff" }}>
                      <option value="" disabled selected>
                        Recent cases
                      </option>
                      {state.recentCases.result.map(({ caseId, urn, description }) => (
                        <option value={caseId}>
                          {urn} {truncate(description)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </header>
          <div class={dividerCssClass}></div>
        </div>
      </>
    );
  }
}
