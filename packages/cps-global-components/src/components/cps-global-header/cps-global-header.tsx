import { Component, Element, h, Host, Prop, Watch } from "@stencil/core";
import { renderError } from "../common/render-error";
import { readyState, mergeTags } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";
import { makeConsole } from "../../logging/makeConsole";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";

const { _debug } = makeConsole("CpsGlobalHeader");

@Component({
  tag: "cps-global-header",
  shadow: true, // must be true as this is our published entry point!
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  @Element() el: HTMLElement;

  @Prop() isDcf: boolean = false;
  @Watch("isDcf")
  onIsDcfChange(newValue: boolean) {
    _debug({ newValue });
    mergeTags({ propTags: { isDcf: String(newValue) } });
  }

  componentWillLoad() {
    // Manually call the handler for initial setup
    this.onIsDcfChange(this.isDcf);
  }

  componentDidLoad() {
    const target = document.createElement("div");
    target.id = "cps-header-main-content";
    target.tabIndex = -1;
    this.el.insertAdjacentElement("afterend", target);
  }

  disconnectedCallback() {
    document.getElementById("cps-header-main-content")?.remove();
  }

  @WithLogging("CpsGlobalHeader")
  render() {
    const { isReady, state } = readyState("context", "preview", "flags");

    const { headerCustomCssClasses, headerCustomCssStyles } =
      isReady && state?.context.found ? state.context : { headerCustomCssClasses: undefined, headerCustomCssStyles: undefined };

    const showGovUkRebrand = isReady && FEATURE_FLAGS.shouldShowGovUkRebrand(state);

    const cssClass = `${showGovUkRebrand ? "govuk-template--rebranded" : ""} ${showGovUkRebrand === "cps" ? "cps-theme" : ""}`;
    return (
      <Host class={headerCustomCssClasses} style={headerCustomCssStyles}>
        <div data-internal-root data-initialisation-status={state.initialisationStatus} class={cssClass}>
          <cps-global-banner></cps-global-banner>
          {state.fatalInitialisationError ? renderError(state.fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
        </div>
      </Host>
    );
  }
}
