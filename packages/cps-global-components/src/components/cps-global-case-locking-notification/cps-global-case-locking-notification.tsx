import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";

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
    const { isReady, state } = readyState("caseLockingPresentUsers");
    if (!isReady || !state.caseLockingPresentUsers || state.caseLockingPresentUsers.users.length === 0) {
      return null;
    }
    const { code, users } = state.caseLockingPresentUsers;
    const upns = users.map(u => u.user).join(", ");
    return (
      <cps-gds-notification-banner dismissible={false}>
        <p class="govuk-body">
          Viewing {friendlyName(code)}: {upns}
        </p>
      </cps-gds-notification-banner>
    );
  }
}
