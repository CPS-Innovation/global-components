import { Component, h } from "@stencil/core";
import { renderError } from "../common/render-error";
import { state } from "../../store/store";

@Component({
  tag: "cps-global-header",
  shadow: true,
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  render() {
    return (
      <div>
        <cps-global-banner></cps-global-banner>
        {state.fatalInitialisationError ? renderError(state.fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
      </div>
    );
  }
}
