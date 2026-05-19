import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";
import { selectVisibleNotifications } from "./select-visible-notifications";
import { sanitiseNotificationHtml } from "../../utils/sanitise-notification-html";
import { handlers } from "../../services/handlers/handlers";

@Component({
  tag: "cps-global-notifications",
  styleUrl: "cps-global-notifications.scss",
  shadow: false,
})
export class CpsGlobalNotifications {
  @WithLogging("CpsGlobalNotifications")
  render() {
    const { isReady, state } = readyState(["notifications", "dismissedNotificationIds", "preview"], []);
    if (!isReady) {
      return null;
    }

    // urlRegex is evaluated once at render time against window.location.href.
    // At the time of writing this is not re-assessed on SPA navigation — if a
    // host app routes between pages without a full reload, the banner stays
    // shown/hidden based on the URL at first render.
    const visible = selectVisibleNotifications({
      notifications: state.notifications,
      dismissedIds: state.dismissedNotificationIds,
      previewNotificationsEnabled: !!state.preview.result?.notifications,
      now: new Date(),
      currentUrl: window.location.href,
    });

    if (!visible.length) {
      return null;
    }

    return (
      <>
        {visible.map(n => {
          const dismissible = n.dismissible !== false;
          return (
            <cps-gds-notification-banner
              key={n.id}
              dismissible={dismissible}
              onCpsDismissed={() => handlers.dismissNotification(n.id)}
            >
              {n.heading && <p class="govuk-notification-banner__heading">{n.heading}</p>}
              <div class="govuk-body" innerHTML={sanitiseNotificationHtml(n.bodyHtml)}></div>
            </cps-gds-notification-banner>
          );
        })}
      </>
    );
  }
}
