import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { WithLogging } from "../../logging/WithLogging";
import { SkipLink } from "../common/SkipLink";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";

@Component({
  tag: "cps-global-banner",
  styleUrl: "cps-global-banner.scss",
  shadow: false,
})
export class CpsGlobalBanner {
  private handleTitleClick = () => {
    const currentBg = window.document.body.style.backgroundColor;
    window.document.body.style.backgroundColor = currentBg === "lightgrey" ? "" : "lightgrey";
  };

  @WithLogging("CpsGlobalBanner")
  render() {
    const { isReady, state } = readyState(["config", "flags", "context", "preview"], ["recentCases"]);

    const resolveValues = () => {
      if (state.fatalInitialisationError) {
        // If there is an error we still want to show our branding.
        //  Use suitable fallback values
        return { isAccessibilityMode: false, showGovUkRebrand: false, href: "" };
      } else if (!isReady) {
        // Otherwise, we are not ready to show anything until our required state is ready
        //  so that we avoid e.g. flashes of incorrect styling
        return undefined;
      } else {
        // Out state is ready
        const isAccessibilityMode = FEATURE_FLAGS.shouldEnableAccessibilityMode(state);
        const showGovUkRebrand = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
        return { isAccessibilityMode, showGovUkRebrand, href: state.config.BANNER_TITLE_HREF };
      }
    };

    const values = resolveValues();
    if (!values) {
      return <></>;
    }

    const { templateCssClass, backgroundColourClass, dividerCssClass } = values.showGovUkRebrand
      ? { templateCssClass: "govuk-template--rebranded", backgroundColourClass: "background-blue", dividerCssClass: "" }
      : { templateCssClass: "", backgroundColourClass: "background-black", dividerCssClass: "header-divider" };

    const handleChange = (event: Event) => {
      const caseId = Number((event.target as HTMLSelectElement).value);
      const { urn } = state.recentCases?.result?.find(recentCase => recentCase.caseId === caseId) || {};
      if (!state.config.RECENT_CASES_NAVIGATE_URL || !urn) {
        return;
      }
      const nextUrl = replaceTagsInString(state.config.RECENT_CASES_NAVIGATE_URL, { caseId, urn });
      window.location.assign(nextUrl);
    };

    return (
      <>
        <div class={templateCssClass}>
          <SkipLink href="#main-content" class="govuk-skip-link skip-link" data-module="govuk-skip-link" {...state.context}>
            Skip to main content
          </SkipLink>
          <header class={`govuk-header govuk-header--with-js-navigation ${backgroundColourClass}`} data-module="govuk-header" data-govuk-header-init="">
            <div class="govuk-header__container" style={{ display: "flex", flexDirection: "row" }}>
              <div class="govuk-header__logo">
                <a href={values.href} class="govuk-header__link govuk-header__link--homepage" onContextMenu={values.isAccessibilityMode ? this.handleTitleClick : undefined}>
                  <span class="govuk-!-font-weight-bold"> CPS </span>
                </a>
              </div>
              <div style={{ marginLeft: "auto" }}></div>
              <div style={{ padding: "0 20px 0 0 " }}>
                <nav aria-label="Menu" class="govuk-header__navigation govuk-header__navigation--end">
                  <ul id="navigation" class="govuk-header__navigation-list">
                    <li class="govuk-header__navigation-item">
                      <a class="govuk-header__link" href="/account/sign-out">
                        Accessibility
                      </a>
                    </li>
                  </ul>
                </nav>
              </div>
              <div style={{ padding: "10px 10px 0 0 " }}>
                {FEATURE_FLAGS.shouldShowRecentCases(state) && state.recentCases?.result?.length && (
                  <select class="govuk-select" onChange={handleChange} style={{ border: "1px solid #fff", fontSize: "0.653m", padding: "0.1em 0.2em" }}>
                    <option value="" disabled selected>
                      Recent cases
                    </option>
                    {state.recentCases.result.map(({ caseId, urn, description }) => (
                      <option value={caseId}>
                        {urn} {description}
                      </option>
                    ))}
                  </select>
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
