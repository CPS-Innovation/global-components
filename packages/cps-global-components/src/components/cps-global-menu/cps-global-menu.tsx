import { Component, h, Fragment } from "@stencil/core";
import { menuConfig } from "./menu-config/menu-config";
import { renderError } from "../common/render-error";
import { store } from "../../store/store";
import { renderWait } from "../common/render-wait";

@Component({
  tag: "cps-global-menu",
  styleUrl: "cps-global-menu.scss",
  shadow: true,
})
export class CpsGlobalMenu {
  render() {
    const { state } = store;

    if (!state.context?.found) {
      return renderError(new Error(`No menu config found for ${window.location.href}`));
    }

    if (!state.auth) {
      return renderWait("Hold up!!");
    }

    const classes = state.config?.SHOW_GOVUK_REBRAND
      ? { flag: "govuk-template--rebranded", level1Background: "background-light-blue", divider: "background-divider-blue" }
      : { flag: "", level1Background: "background-grey", divider: "background-divider" };

    const {
      links: [level1Links, level2Links],
    } = menuConfig(state.context, state.config, state.flags, state.tags);

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
  }
}
