import { Component, Prop, h, State, Fragment } from "@stencil/core";
import { CONFIG_ASYNC } from "../../config.js";
import { trackPageViewAsync } from "../../analytics";
import { Config } from "cps-global-configuration";
import { menuHelper, ResolvedLink } from "./menu-helper";

@Component({
  tag: "cps-global-header",
  styleUrl: "cps-global-header.scss",
  shadow: true,
})
export class CpsGlobalHeader {
  @Prop() name: string = "Please wait...";
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

  renderError = (msg: string) => <div class="level-1 background-grey no-config">{msg}</div>;

  renderOk = ([level1Links, level2Links]: ResolvedLink[][]) => {
    const { SURVEY_LINK } = this.CONFIG;
    return (
      <div>
        <nav class="level-1 background-grey" aria-label="Menu">
          <ul>
            {level1Links.map(link => (
              <nav-link {...link}></nav-link>
            ))}
            {SURVEY_LINK && <nav-link label="Give feedback" href={SURVEY_LINK}></nav-link>}
          </ul>
        </nav>

        <div class="background-divider"></div>

        {!!level2Links?.length && (
          <>
            <nav class="level-2 background-white" aria-label="Sub-menu">
              <ul>
                {level2Links.map(link => (
                  <nav-link {...link}></nav-link>
                ))}
              </ul>
            </nav>
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
    const { found, links } = menuHelper(this.CONFIG, window);

    return (
      <>
        {!!_CONFIG_ERROR && this.renderError(_CONFIG_ERROR)}
        {SHOULD_SHOW_HEADER && this.renderHeader()}
        {SHOULD_SHOW_MENU && (found ? this.renderOk(links) : this.renderError(`No menu config found for ${window.location.href}`))}
      </>
    );
  }
}
