import { Component, Prop, h, State, Fragment } from "@stencil/core";
import { getLocationConfig } from "../../context/get-location-config";
import { LinkCode, MatchedPathMatcher } from "../../context/LocationConfig";
import { CONFIG_ASYNC } from "../../config.js";
import { trackPageViewAsync } from "../../analytics";
import { Config } from "cps-global-configuration";

type LinkHelperArg = { code: LinkCode; label: string; children?: LinkCode[]; openInNewTab?: boolean; parentCode?: LinkCode };

const SHOULD_SHOW_NAME = false;
const SHOULD_SHOW_CMS_LINKS = false;
const SHOULD_SHOW_MATERIALS_MENU = false;

@Component({
  tag: "cps-global-header",
  styleUrl: "cps-global-header.scss",
  shadow: true,
})
export class CpsGlobalHeader {
  @Prop() name: string = "Please wait...";
  @State() config: MatchedPathMatcher;
  @State() CONFIG: Config;

  // We have address as State so that we get a rerender triggered whenever it updates
  @State() address: string;

  async componentWillLoad() {
    trackPageViewAsync();

    window.navigation.addEventListener("navigate", event => {
      this.address = event.destination.url;
      trackPageViewAsync();
    });

    this.CONFIG = await CONFIG_ASYNC;
  }

  async componentWillRender() {
    this.config = getLocationConfig(window);
  }

  linkHelper = ({ code, label, children = [], openInNewTab }: LinkHelperArg) => ({
    label,
    href: this.config.matchedLinkCode === code ? this.config.href : this.config?.onwardLinks[code],
    selected: this.config?.matchedLinkCode === code || children.includes(this.config?.matchedLinkCode),
    openInNewTab,
  });

  renderError = (msg: string) => <div class="level-1 background-grey no-config">{msg}</div>;

  renderOk = () => {
    const { SURVEY_LINK } = this.CONFIG;
    return (
      <div>
        <div class="level-1 background-grey">
          <ul>
            <nav-link {...this.linkHelper({ code: "tasks", label: "Tasks" })}></nav-link>
            <nav-link {...this.linkHelper({ code: "cases", label: "Cases", children: ["details", "case-materials", "review"] })}></nav-link>
          </ul>
          {SURVEY_LINK && (
            <ul>
              <nav-link label="Give feedback" href={SURVEY_LINK}></nav-link>
            </ul>
          )}
        </div>

        <div class="background-divider"></div>

        {this.config.showSecondRow && (
          <>
            <div class="level-2 background-white">
              {SHOULD_SHOW_NAME && (
                <div class="background-left-only">
                  <span class="name">{this.name}</span>
                </div>
              )}
              <ul>
                <nav-link {...this.linkHelper({ code: "details", label: "Details", parentCode: "cases" })}></nav-link>

                {SHOULD_SHOW_MATERIALS_MENU ? (
                  <drop-down
                    label="Materials"
                    links={[
                      this.linkHelper({ code: "case-materials", label: "Case Materials", parentCode: "cases" }),
                      this.linkHelper({ code: "bulk-um-classification", label: "Bulk UM classification", parentCode: "cases" }),
                    ]}
                  ></drop-down>
                ) : (
                  <nav-link {...this.linkHelper({ code: "case-materials", label: "Materials", parentCode: "cases" })}></nav-link>
                )}
                <nav-link {...this.linkHelper({ code: "review", label: "Review", parentCode: "cases" })}></nav-link>
              </ul>
              <div class="slot-container">
                <slot />
              </div>
              <ul>
                {SHOULD_SHOW_CMS_LINKS && (
                  <drop-down
                    label="CMS Classic"
                    menuAlignment="right"
                    links={[this.linkHelper({ code: "cms-pre-charge-triage", label: "Pre-charge triage", openInNewTab: true })]}
                  ></drop-down>
                )}
              </ul>
            </div>
            <div class="background-divider"></div>
          </>
        )}
      </div>
    );
  };

  renderHeader = () => (
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

  render() {
    const { _CONFIG_ERROR, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU } = this.CONFIG;
    return (
      <>
        {!!_CONFIG_ERROR && this.renderError(_CONFIG_ERROR)}
        {SHOULD_SHOW_HEADER && this.renderHeader()}
        {SHOULD_SHOW_MENU && (this.config ? this.renderOk() : this.renderError(`No menu config found for ${window.location.href}`))}
      </>
    );
  }
}
