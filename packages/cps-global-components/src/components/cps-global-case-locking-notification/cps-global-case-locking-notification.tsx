import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

// Rendered as "Viewing <friendly name>: <users>". Keyed by region code, which is
// also the section kind we register against.
const FRIENDLY_NAMES: Record<string, string> = {
  case: "this case",
  witness: "witnesses on this case",
};

const friendlyName = (code: string) => FRIENDLY_NAMES[code] ?? code;

@Component({
  tag: "cps-global-case-locking-notification",
  shadow: false,
})
export class CpsGlobalCaseLockingNotification {
  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth"]);
    if (!isReady) {
      return null;
    }
    // Presence REGISTRATION is deliberately NOT gated here — we want the hub and
    // the API exercised by real traffic in QA. This gates only the manifestation,
    // so a caseworker does not discover a banner mid-work while we are still
    // building it. See caseLockingNotifications in Preview.ts.
    if (!FEATURE_FLAGS.shouldShowCaseLockingNotifications(state)) {
      return null;
    }
    if (!state.caseLockingPresentUsers || state.caseLockingPresentUsers.users.length === 0) {
      return null;
    }
    const { code, users } = state.caseLockingPresentUsers;
    const upns = users.map(u => u.user).join(", ");
    return (
      // Pinned to the bottom and collapsed to its header, per the UCD prototype:
      // presence is ambient information, so it should be reachable without
      // taking the top of the screen away from the work.
      //
      // Wording is deliberately plain. We can say who is present and where; we
      // cannot say what they are doing or whether it is safe to proceed, so we
      // do not imply it.
      <cps-gds-notification-banner titleText="Case activity" pinned collapsible dismissible={false}>
        <p class="govuk-body">
          Also viewing {friendlyName(code)}: {upns}
        </p>
      </cps-gds-notification-banner>
    );
  }
}
