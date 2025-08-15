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
    const { status, error } = state;

    return (
      <div>
        <cps-global-banner></cps-global-banner>
        {status === "broken" && renderError(error)}
        {status === "auth-known" && <cps-global-menu></cps-global-menu>}
      </div>
    );
  }
}
