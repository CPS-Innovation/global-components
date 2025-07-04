import { Component, h } from "@stencil/core";
import { detectOverrideMode } from "../../override-mode/detect-override-mode";

@Component({
  tag: "cps-global-banner",
  styleUrl: "cps-global-banner.scss",
  shadow: true,
})
export class CpsGlobalBanner {
  private handleTitleClick = () => {
    if (!detectOverrideMode(window)) {
      return;
    }
    const currentBg = window.document.body.style.backgroundColor;
    window.document.body.style.backgroundColor = currentBg === "lightgrey" ? "" : "lightgrey";
  };

  render() {
    return (
      <div>
        <a href="#main-content" class="govuk-skip-link skip-link" data-module="govuk-skip-link">
          Skip to main content
        </a>
        <header class="govuk-header background-black">
          <div class="govuk-header__container">
            <div class="govuk-header__logo">
              <span class="govuk-header__link govuk-header__link--homepage">
                <span class="header-title" onClick={this.handleTitleClick}>
                  CPS
                </span>{" "}
                <span class="header-sub-title"></span>
              </span>
            </div>
          </div>
        </header>
        <div class="header-divider"></div>
      </div>
    );
  }
}
