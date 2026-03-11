import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "../../feature-flags/feature-flags";
import { WithLogging } from "../../logging/WithLogging";

@Component({
  tag: "cps-global-home-page-notification",
  shadow: true,
  styleUrl: "cps-global-home-page-notification.scss",
})
export class CpsGlobalHomePageNotification {
  @WithLogging("CpsGlobalHomePageNotification")
  render() {
    const { isReady, state } = readyState(["config", "context", "preview", "flags"], ["auth"]);

    const shouldShowNotification = isReady && state.context.found && state.context.showNotification && FEATURE_FLAGS.shouldShowHomePageNotification(state);

    if (!shouldShowNotification) {
      return null;
    }

    return (
      <cps-gds-notification-banner titleText="Important">
        <p class="govuk-body">Introductory sessions to this service are available, and are recommended. Speak to your digital transformation lead to request yours.</p>
      </cps-gds-notification-banner>
    );
  }
}
