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
    const { isReady, state } = readyState(["config"], ["auth"]);

    if (!isReady) {
      return null;
    }

    if (!FEATURE_FLAGS.shouldShowHomePageNotification(state)) {
      return null;
    }

    return (
      <cps-gds-notification-banner titleText="Important">
        <p class="govuk-body">Introductory sessions to this service are available, and are recommended. Speak to your digital transformation lead to request yours.</p>
      </cps-gds-notification-banner>
    );
  }
}
