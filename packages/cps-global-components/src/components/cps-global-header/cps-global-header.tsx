import { Component, h, Host } from "@stencil/core";
import { renderError } from "../common/render-error";
import { rawState, readyState } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";
import { _console } from "../../logging/_console";
@Component({
  tag: "cps-global-header",
  shadow: true, // must be true as this is our published entry point!
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  @WithLogging("CpsGlobalHeader")
  render() {
    const { fatalInitialisationError, initialisationStatus } = rawState();

    const state = readyState("context");
    if (!state) {
      return null;
    }

    return (
      <Host class={state.context.found ? state.context.headerCustomCssClasses : ""}>
        <div data-internal-root data-initialisation-status={initialisationStatus}>
          <cps-global-banner></cps-global-banner>
          {fatalInitialisationError ? renderError(fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
        </div>
      </Host>
    );
  }
}
