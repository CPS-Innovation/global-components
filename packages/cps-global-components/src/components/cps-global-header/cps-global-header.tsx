import { Component, h } from "@stencil/core";
import { renderError } from "../common/render-error";
import { rawState } from "../../store/store";
import { _console } from "../../logging/_console";
import { WithLogging } from "../../logging/WithLogging";
@Component({
  tag: "cps-global-header",
  shadow: true,
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  @WithLogging
  render() {
    const { fatalInitialisationError } = rawState();
    return (
      <div>
        <cps-global-banner></cps-global-banner>
        {fatalInitialisationError ? renderError(fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
      </div>
    );
  }
}
