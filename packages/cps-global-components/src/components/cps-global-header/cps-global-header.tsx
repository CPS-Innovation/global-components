import { Component, h, Host, Prop, Watch } from "@stencil/core";
import { renderError } from "../common/render-error";
import { readyState } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";
import { _console } from "../../logging/_console";
import { register } from "../../global-script";
@Component({
  tag: "cps-global-header",
  shadow: true, // must be true as this is our published entry point!
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  @Prop() isDcf: boolean = false;
  @Watch("isDcf")
  onIsDcfChange(newValue: boolean) {
    _console.debug({ newValue });
    register({ propTags: { isDcf: String(newValue) } });
  }

  componentWillLoad() {
    // Manually call the handler for initial setup
    this.onIsDcfChange(this.isDcf);
  }

  @WithLogging("CpsGlobalHeader")
  render() {
    const { isReady, state } = readyState("context");

    const { headerCustomCssClasses, headerCustomCssStyles } =
      isReady && state?.context.found ? state.context : { headerCustomCssClasses: undefined, headerCustomCssStyles: undefined };

    return (
      <Host class={headerCustomCssClasses} style={headerCustomCssStyles}>
        <div data-internal-root data-initialisation-status={state.initialisationStatus}>
          <cps-global-banner></cps-global-banner>
          {state.fatalInitialisationError ? renderError(state.fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
        </div>
      </Host>
    );
  }
}
