import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";

const FRIENDLY_NAMES: Record<string, string> = {
  witness: "witnesses",
};

const friendlyName = (code: string) => FRIENDLY_NAMES[code] ?? code;

@Component({
  tag: "cps-global-case-locking-notification",
  shadow: false,
})
export class CpsGlobalCaseLockingNotification {
  render() {
    const { isReady, state } = readyState("caseLockingClash");
    if (!isReady || !state.caseLockingClash) {
      return null;
    }
    const { upn, code } = state.caseLockingClash;
    return (
      <cps-gds-notification-banner dismissible={false}>
        <p class="govuk-body">
          {upn} has locked {friendlyName(code)} for this case
        </p>
      </cps-gds-notification-banner>
    );
  }
}
