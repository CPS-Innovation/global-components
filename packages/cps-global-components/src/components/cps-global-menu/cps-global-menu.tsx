import { Component, Prop, h, State, Fragment } from "@stencil/core";
import { CONFIG_ASYNC } from "../../config/config-async";

import { Config } from "cps-global-configuration";
import { menuConfig, MenuConfigResult } from "./menu-config/menu-config";
import { renderError } from "../common/render-error";
import { initiateTracking } from "../../analytics/initiate-tracking";
import "./menu-config/helpers/dom/initialisation";
import { initialiseDomObservation } from "./menu-config/helpers/dom/initialisation";

@Component({
  tag: "cps-global-menu",
  styleUrl: "cps-global-menu.scss",
  shadow: true,
})
export class CpsGlobalMenu {
  @Prop() name: string = "Please wait...";
  @State() CONFIG: Config;

  // We have address as State so that we get a rerender triggered whenever it updates
  @State() address: string;
  @State() mutationFlag: number;

  async componentWillLoad() {
    initiateTracking();
    window.navigation.addEventListener("navigate", event => {
      this.address = event.destination.url;
    });

    this.CONFIG = await CONFIG_ASYNC();

    // For host apps where we can not find caseId, urn etc tags in the address, we can observe the dom
    //  for these values.
    initialiseDomObservation(this.CONFIG, window, () => {
      // If the dom changes and tags have been found, this subscribing function sets some
      //  arbitrary State to ensure a rerender.
      this.mutationFlag = +new Date();
    });
  }

  renderOk = ([level1Links, level2Links]: MenuConfigResult["links"]) => {
    const { SURVEY_LINK } = this.CONFIG;
    return (
      <div>
        <nav class="level-1 background-grey" aria-label="Menu" data-testid="menu-level-1">
          <ul>
            {level1Links?.map(link => (
              <nav-link {...link}></nav-link>
            ))}
            {SURVEY_LINK && <nav-link class="survey-link" label="Give feedback" href={SURVEY_LINK}></nav-link>}
          </ul>
        </nav>

        <div class="background-divider"></div>

        {!!level2Links?.length && (
          <>
            <nav class="level-2 background-white" aria-label="Sub-menu" data-testid="menu-level-2">
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

  render() {
    const { _CONFIG_ERROR } = this.CONFIG;
    const { found, links } = menuConfig(this.CONFIG, window);

    if (_CONFIG_ERROR) {
      return renderError(_CONFIG_ERROR);
    } else if (!found) {
      renderError(`No menu config found for ${window.location.href}`);
    } else {
      return this.renderOk(links);
    }
  }
}
