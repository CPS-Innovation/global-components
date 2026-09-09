import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { formatJoined } from "../../services/case-locking/format-joined";
import { CCPPeople, CCPSectionNames } from "cps-global-presence";
import { CaseLockingPresentSection } from "../../services/case-locking/CaseLockingPresentUsers";

// COLLAPSED IN THE SHARED CODE, not here. The API's records are denormalised —
// one per user, per section, per application — so the same person on the case and
// editing a witness within it, from two OutSystems apps, arrives four times. What a
// reader wants is the person once, with the applications they are in; and because
// Work Management and Case Review both display as RCMS, someone in both is in one
// application, not two. CCPPeople.collapse is the single implementation of that,
// shared with the Classic and Modern clients so all three agree.
const collapsePeople = (sections: CaseLockingPresentSection[]) =>
  CCPPeople.collapse(
    sections.flatMap(section =>
      section.users.map(user => ({ userEmail: user.user, sourceApplication: user.appName, joinedAt: user.joinedAt, sections: user.sections })),
    ),
  );

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

    const people = collapsePeople(present.sections).length;
    // The prototype's heading reads "Case locked as 1 user is editing with 2
    // users viewing". We can count people and name their sections; we cannot say
    // who is EDITING or that anything is LOCKED, because the presence API reports
    // neither. So the summary states only what we know.
    const summary = people === 1 ? "1 other person is working on this case" : `${people} other people are working on this case`;

    return (
      <cps-global-pinned-notification titleText={summary} collapsible dismissible={false}>
        {present.sections.map(section => (
          <div>
            {/* Collapsed WITHIN the section, not across them: a person in two
                sections is genuinely in two sections and is listed under each. What
                must never happen is one person reading as two because the API sent a
                record per application. */}
            {collapsePeople([section]).map(person => {
              // "RCMS since 3.38pm on 8 September 2026", one clause per application.
              // The API can give us a person with no application at all, in which
              // case they are simply here and we say no more than that.
              const where = person.apps
                .map(app => {
                  const since = formatJoined(app.timeEntered);
                  return since ? `${app.appDisplayName} since ${since}` : app.appDisplayName;
                })
                .join(", ");
              // WHICH PART OF THE CASE they are in, in words. A case-wide session
              // reports everyone anywhere in the case, so "this case" was true of
              // everybody and told the reader nothing; naming the section is the
              // difference between "someone is here" and "someone is on the review".
              //
              // "this witness or victim" when their subject is the one in focus,
              // "a witness or victim" when it is another one in the same case —
              // the difference between a collision and a coincidence.
              const sections = CCPSectionNames.describe(person.sections ?? []);
              return (
                <p class="govuk-body">
                  {person.username}
                  {sections ? ` is in ${sections}` : ""}
                  {where ? ` — ${where}` : ""}
                  {!sections && !where ? " is on this case." : "."}
                </p>
              );
            })}
          </div>
        ))}
      </cps-global-pinned-notification>
    );
  }
}
