import { Component, h, Fragment } from "@stencil/core";
import { menuConfig } from "./menu-config/menu-config";
import { readyState } from "../../store/store";
import { FLAGS } from "../../feature-flags/feature-flags";
import { renderError } from "../common/render-error";
import { _console } from "../../logging/_console";
import { WithLogging } from "../../logging/WithLogging";
@Component({
  tag: "cps-global-menu",
  styleUrl: "cps-global-menu.scss",
  shadow: true,
})
export class CpsGlobalMenu {
  @WithLogging
  render() {
    const state = readyState("config", "auth", "tags", "flags", "context");
    if (!state) {
      return null;
    }

    const shouldShowMenu = FLAGS.shouldShowMenu(state);
    if (!shouldShowMenu) {
      return null;
    }

    const showGovUkRebrand = FLAGS.shouldShowGovUkRebrand(state);
    const surveyLink = FLAGS.surveyLink(state);

    const classes = showGovUkRebrand
      ? { flag: "govuk-template--rebranded", level1Background: "background-light-blue", divider: "background-divider-blue" }
      : { flag: "", level1Background: "background-grey", divider: "background-divider" };

    const config = menuConfig(state);
    if (config.status === "error") {
      return renderError(config.error);
    }
    const {
      links: [level1Links, level2Links],
    } = config;
    return (
      <div class={classes.flag}>
        <nav class={`level level-1 ${classes.level1Background}`} aria-label="Menu" data-testid="menu-level-1">
          <ul>
            {level1Links?.map(link => (
              <nav-link {...link}></nav-link>
            ))}
            {surveyLink.showLink && <nav-link openInNewTab class="survey-link" label="Give feedback" href={surveyLink.url}></nav-link>}
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
