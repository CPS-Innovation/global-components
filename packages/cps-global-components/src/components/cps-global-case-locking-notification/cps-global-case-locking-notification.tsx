import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { formatJoined } from "../../services/case-locking/format-joined";
import { CaseLockingPresentSection } from "../../services/case-locking/CaseLockingPresentUsers";

// The region code is also the section kind we register against. Anything not
// listed falls back to the code itself rather than guessing a label.
const FRIENDLY_NAMES: Record<string, string> = {
  case: "This case",
  witness: "Witnesses",
  victim_witness: "Witnesses",
  defendant: "Defendants",
  case_review: "Case review",
};

const friendlyName = (code: string) => FRIENDLY_NAMES[code] ?? code;

// One person may hold several sections; the summary counts PEOPLE, not sessions,
// which is what "2 users viewing" means to a reader.
const distinctUsers = (sections: CaseLockingPresentSection[]) => {
  const seen = new Set<string>();
  sections.forEach(section => section.users.forEach(user => seen.add(user.user.toLowerCase())));
  return seen.size;
};

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
    const present = state.caseLockingPresentUsers;
    if (!present || present.sections.length === 0) {
      return null;
    }

    const people = distinctUsers(present.sections);
    // The prototype's heading reads "Case locked as 1 user is editing with 2
    // users viewing". We can count people and name their sections; we cannot say
    // who is EDITING or that anything is LOCKED, because the presence API reports
    // neither. So the summary states only what we know.
    const summary = people === 1 ? "1 other person is working on this case" : `${people} other people are working on this case`;

    return (
      <cps-gds-notification-banner titleText={summary} pinned collapsible dismissible={false}>
        {present.sections.map(section => (
          <div>
            <h3 class="govuk-heading-s">{friendlyName(section.code)}</h3>
            {section.users.map(user => {
              const since = formatJoined(user.joinedAt);
              return (
                <p class="govuk-body">
                  {user.user}
                  {since ? ` has been in this section since ${since}.` : " is in this section."}
                </p>
              );
            })}
          </div>
        ))}
      </cps-gds-notification-banner>
    );
  }
}
