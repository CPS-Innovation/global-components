import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { WithLogging } from "../../logging/WithLogging";
import { replaceTagsInString } from "../cps-global-menu/menu-config/helpers/replace-tags-in-string";
import { linkHandoverAdapter } from "../cps-global-menu/menu-config/helpers/link-handover-adapter";

@Component({
  tag: "cps-global-banner",
  styleUrl: "cps-global-banner.scss",
  shadow: false,
})
export class CpsGlobalBanner {
  @WithLogging("CpsGlobalBanner")
  render() {
    const { isReady, state } = readyState(["config", "flags", "context", "preview"], ["recentCases"]);

    const resolveValues = () => {
      if (state.fatalInitialisationError) {
        // If there is an error we still want to show our branding.
        //  Use suitable fallback values
        return { showBanner: true, showGovUkRebrand: false, showRecentCases: false, href: "" };
      } else if (!isReady) {
        // Otherwise, we are not ready to show anything until our required state is ready
        //  so that we avoid e.g. flashes of incorrect styling
        return { showBanner: false, showGovUkRebrand: false, showRecentCases: false, href: "" };
      } else {
        // Out state is ready
        const showGovUkRebrand = FEATURE_FLAGS.shouldShowGovUkRebrand(state);
        const showRecentCases = FEATURE_FLAGS.shouldShowRecentCases(state);
        return { showBanner: true, showGovUkRebrand, showRecentCases, href: linkHandoverAdapter(state)(state.config.BANNER_TITLE_HREF) };
      }
    };

    const { showBanner, showGovUkRebrand, href, showRecentCases } = resolveValues();
    if (!showBanner) {
      return <></>;
    }

    const { backgroundColourClass, dividerCssClass, recentCasesStyles } = showGovUkRebrand
      ? { backgroundColourClass: "background-blue", dividerCssClass: "", recentCasesStyles: { marginTop: "10px" } }
      : { backgroundColourClass: "background-black", dividerCssClass: "header-divider", recentCasesStyles: { marginTop: "-5px" } };

    const handleChange = (event: Event) => {
      const caseId = Number((event.target as HTMLSelectElement).value);
      const { urn } = state.recentCases?.result?.find(recentCase => recentCase.caseId === caseId) || {};
      if (!state.config.RECENT_CASES_NAVIGATE_URL || !urn) {
        return;
      }
      const nextUrl = replaceTagsInString(state.config.RECENT_CASES_NAVIGATE_URL, { caseId, urn });
      const authAdaptedNextUrl = linkHandoverAdapter(state)(nextUrl);
      window.location.assign(authAdaptedNextUrl);
    };

    const truncate = (str: string, max = 10) => (str.length > max ? str.slice(0, max) + "..." : str);

    return (
      <div>
        <cps-skip-links />
        <header class={`govuk-header govuk-header--with-js-navigation ${backgroundColourClass}`} data-module="govuk-header" data-govuk-header-init="">
          <div class="govuk-header__container" style={{ display: "flex", flexDirection: "row" }}>
            <div class="govuk-header__logo">
              <a href={href} class="govuk-header__link govuk-header__link--homepage">
                <span class="govuk-!-font-weight-bold"> CPS </span>
              </a>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: "2rem" }}>
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
    );
  }
}
