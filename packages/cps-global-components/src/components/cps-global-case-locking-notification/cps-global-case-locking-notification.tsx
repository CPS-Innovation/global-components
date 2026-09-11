import { Component, h } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { formatJoined } from "../../services/case-locking/format-joined";
import { CCPPeople, CCPSectionNames } from "cps-global-presence";
import { CaseLockingPresentSection } from "../../services/case-locking/CaseLockingPresentUsers";
import { describeCaseLock, getCaseLock } from "../../services/case-locking/get-case-lock";

// COLLAPSED IN THE SHARED CODE, not here. The API's records are denormalised —
// one per user, per section, per application — so the same person on the case and
// editing a witness within it, from two OutSystems apps, arrives four times. What a
// reader wants is the person once, with the applications they are in; and because
// Work Management and Case Review both display as RCMS, someone in both is in one
// application, not two. CCPPeople.collapse is the single implementation of that,
// shared with the Classic and Modern clients so all three agree.
const collapsePeople = (sections: CaseLockingPresentSection[], viewer: string | undefined) =>
  CCPPeople.collapse(
    sections.flatMap(section =>
      section.users.map(user => ({ userEmail: user.user, sourceApplication: user.appName, joinedAt: user.joinedAt, sections: user.sections })),
    ),
    viewer,
  );

@Component({
  tag: "cps-global-case-locking-notification",
  shadow: false,
})
export class CpsGlobalCaseLockingNotification {
  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth", "caseDetails"]);
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
    // EITHER IS ENOUGH. A lock with nobody present is the ordinary result of someone
    // closing their browser on the Classic case screen — the lock outlives the
    // session — and it is the more consequential of the two facts, so it must be
    // able to raise this banner on its own.
    const lock = getCaseLock(state.caseDetails);
    const locked = !!lock?.locked;
    if ((!present || present.sections.length === 0) && !locked) {
      return null;
    }

    // WHO IS READING, so the reader can be marked rather than silently dropped.
    // While the feature is being built we count ourselves: a roster that includes
    // you, and says so, is the only evidence from outside that the identification
    // works — filtering proves nothing, because an empty banner looks the same
    // whether self-detection works or presence is broken.
    // Narrowed rather than optional-chained: AuthResult is a union and only the
    // authenticated arm carries a username. Unauthenticated means nobody is marked,
    // which is the same safe default as an unanswered whoami on the legacy clients.
    const viewer = state.auth?.isAuthed ? state.auth.username : undefined;
    const sections = present?.sections ?? [];
    const collapsed = collapsePeople(sections, viewer);
    const people = collapsed.length;
    const includesSelf = collapsed.some(person => person.isCurrentUser);
    // The prototype's heading reads "Case locked as 1 user is editing with 2
    // users viewing". We can count people and name their sections; we cannot say
    // who is EDITING or that anything is LOCKED, because the presence API reports
    // neither. So the summary states only what we know.
    //
    // "OTHER" IS DROPPED WHEN THE COUNT INCLUDES US, because it would be a lie —
    // "2 other people" alongside a list that names you as one of them. The
    // production wording is the "other" branch, and it comes back on its own once
    // we stop counting ourselves.
    const working = includesSelf
      ? people === 1
        ? "1 person is working on this case"
        : `${people} people are working on this case`
      : people === 1
        ? "1 other person is working on this case"
        : `${people} other people are working on this case`;
    // THE LOCK LEADS. Presence is someone reading over your shoulder; the lock is
    // the case refusing to be written to. When both are true the lock goes first
    // and presence follows as the subordinate clause, because that is the order a
    // reader needs them in to decide what to do next.
    //
    // "currently" earns its place only in the compound sentence, where it separates
    // the standing state of the case from who happens to be on it right now.
    const summary = locked ? (people ? `This case is locked, and ${working.replace(" is working", " is currently working").replace(" are working", " are currently working")}` : "This case is locked") : working;

    return (
      <cps-global-pinned-notification titleText={summary} collapsible dismissible={false}>
        {/* FIRST IN THE BODY, above the roster, for the same reason it leads the
            heading. The name is whatever CMS recorded; we make no attempt to match it
            to the people in the roster below — that reconciliation is a separate
            problem and a wrong guess would read worse than two unjoined facts. */}
        {locked && <p class="govuk-body">{describeCaseLock(lock)}</p>}
        {sections.map(section => (
          <div>
            {/* Collapsed WITHIN the section, not across them: a person in two
                sections is genuinely in two sections and is listed under each. What
                must never happen is one person reading as two because the API sent a
                record per application. */}
            {collapsePeople([section], viewer).map(person => {
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
                  {CCPPeople.displayName(person)}
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
