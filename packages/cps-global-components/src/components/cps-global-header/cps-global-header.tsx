import { Component, h } from "@stencil/core";
import { renderError } from "../common/render-error";
import { store } from "../../store/store";
@Component({
  tag: "cps-global-header",
  shadow: true,
  styleUrl: "cps-global-header.scss",
})
export class CpsGlobalHeader {
  render() {
    const { state } = store;
    return (
      <div>
        <cps-global-banner></cps-global-banner>
        {state.fatalInitialisationError ? renderError(state.fatalInitialisationError) : <cps-global-menu></cps-global-menu>}
      </div>
    );
  }
}
