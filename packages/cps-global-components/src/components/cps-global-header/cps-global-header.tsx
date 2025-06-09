import { Component, h, State } from "@stencil/core";
import { CONFIG_ASYNC } from "../../config/config-async";
import { Config } from "cps-global-configuration";
import { renderError } from "../common/render-error";
import { initiateTracking } from "../../analytics/initiate-tracking";

@Component({
  tag: "cps-global-header",
  shadow: true,
})
export class CpsGlobalHeader {
  @State() CONFIG: Config;

  async componentWillLoad() {
    initiateTracking();
    this.CONFIG = await CONFIG_ASYNC();
  }

  render() {
    const { _CONFIG_ERROR, SHOULD_SHOW_HEADER, SHOULD_SHOW_MENU } = this.CONFIG;
    return (
      <div>
        {!!_CONFIG_ERROR && renderError(_CONFIG_ERROR)}
        {SHOULD_SHOW_HEADER && <cps-global-banner></cps-global-banner>}
        {SHOULD_SHOW_MENU && <cps-global-menu></cps-global-menu>}
      </div>
    );
  }
}
