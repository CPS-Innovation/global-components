import { Component, h, Fragment } from "@stencil/core";

@Component({
  tag: "cps-global-banner",
  styleUrl: "cps-global-banner.scss",
  shadow: true,
})
export class CpsGlobalBanner {
  render() {
    return (
      <>
        <a href="#main-content" class="govuk-skip-link skip-link" data-module="govuk-skip-link">
          Skip to main content
        </a>
        <header class="govuk-header background-black">
          <div class="govuk-header__container">
            <div class="govuk-header__logo">
              <span class="govuk-header__link govuk-header__link--homepage">
                <span class="header-title">CPS</span> <span class="header-sub-title"></span>
              </span>
            </div>
          </div>
        </header>
        <div class="header-divider"></div>
      </>
    );
  }
}
