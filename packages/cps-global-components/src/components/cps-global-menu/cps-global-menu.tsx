import { Component, Prop, h, State, Fragment } from "@stencil/core";
import { menuConfig, MenuConfigResult } from "./menu-config/menu-config";
import { renderError } from "../common/render-error";
import "./menu-config/helpers/dom/try-initialise-dom-observation";
import { tryInitialiseDomObservation } from "./menu-config/helpers/dom/try-initialise-dom-observation";
import { state } from "../../store/store";

@Component({
  tag: "cps-global-menu",
  styleUrl: "cps-global-menu.scss",
  shadow: true,
})
export class CpsGlobalMenu {
  @Prop() name: string = "Please wait...";

  // We have address as State so that we get a rerender triggered whenever it updates
  @State() address: string;
  @State() mutationFlag: number;

  async componentWillLoad() {
    window.navigation.addEventListener("navigate", event => {
      this.address = event.destination.url;
    });

    // For host apps where we can not find caseId, urn etc tags in the address, we can observe the dom
    //  for these values.
    tryInitialiseDomObservation(state.config, window, () => {
      // If the dom changes and tags have been found, this subscribing function sets some
      //  arbitrary State to ensure a rerender.
      this.mutationFlag = +new Date();
    });
  }

  renderOk = ([level1Links, level2Links]: MenuConfigResult["links"]) => {
    const classes = state.config.SHOW_GOVUK_REBRAND
      ? { flag: "govuk-template--rebranded", level1Background: "background-light-blue", divider: "background-divider-blue" }
      : { flag: "", level1Background: "background-grey", divider: "background-divider" };
    return (
      <div class={classes.flag}>
        <nav class={`level level-1 ${classes.level1Background}`} aria-label="Menu" data-testid="menu-level-1">
          <ul>
            {level1Links?.map(link => (
              <nav-link {...link}></nav-link>
            ))}
            {state.config.SURVEY_LINK && <nav-link openInNewTab class="survey-link" label="Give feedback" href={state.config.SURVEY_LINK}></nav-link>}
          </ul>
        </nav>

        <div class={classes.divider}></div>

        {!!level2Links?.length && (
          <>
            <nav class="level level-2 background-white" aria-label="Sub-menu" data-testid="menu-level-2">
              <ul>
                {level2Links.map(link => (
                  <nav-link {...link}></nav-link>
                ))}
              </ul>
            </nav>
            <div class={classes.divider}></div>
          </>
        )}
      </div>
    );
  };

  render() {
    const { found, links } = menuConfig(state.config, window);

    if (state.status === "broken") {
      return renderError(state.error);
    } else if (!found) {
      renderError(new Error(`No menu config found for ${window.location.href}`));
    } else {
      return this.renderOk(links);
    }
  }
}
