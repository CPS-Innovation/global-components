import { Component, h, Host, State, VNode } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { formatJoined } from "../../services/case-locking/format-joined";
import { CCPContent, CCPPeople, CCPSectionNames } from "cps-global-presence";
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

// Long enough for assistive tech to have registered the empty live region before
// it is first given text. See liveRegionReady.
const LIVE_REGION_SETTLE_MS = 500;

// Spoken when the banner goes away, but only if its summary was spoken first.
// See hasAnnounced. The words live in CCPContent with every other sentence
// presence shows, so the three UIs cannot drift apart again.
const ALL_CLEAR = CCPContent.ALL_CLEAR;

@Component({
  tag: "cps-global-case-locking-notification",
  shadow: false,
})
export class CpsGlobalCaseLockingNotification {
  /**
   * THE BANNER IS NOT WHAT ANNOUNCES ITSELF. It is a landmark (role="region"), so
   * a screen reader user finds it only by going looking, and it arrives mid-work
   * with nothing to tell them it is there — WCAG 4.1.3. The announcement is a
   * separate, visually hidden role="status" that we render from our very first
   * render and keep for our whole lifetime, empty when there is nothing to say.
   *
   * WHY IT MUST EXIST BEFORE IT HAS ANYTHING IN IT: assistive tech watches a live
   * region for CHANGES. One inserted with its text already in it is announced by
   * some screen reader / browser pairs and silently missed by others. The header
   * is re-created across some SPA navigations with the store already populated,
   * and on that path our first render would carry the text — so we hold the text
   * back until the empty region has been in the DOM for a moment.
   *
   * POLITE, NOT AN ALERT. Someone else opening the case is worth knowing, not
   * worth interrupting a sentence for; the interstitial is the interruption, and
   * it is an alertdialog that takes focus. Only the summary is spoken — the roster
   * is in the banner for whoever wants it — and Stencil writes the region only when
   * the summary actually changes, so a poll that finds the same people says nothing.
   */
  @State() liveRegionReady = false;

  /**
   * THE BANNER LEAVING IS NEWS TOO, but only to someone who was told it arrived.
   * A sighted user sees the banner go; without this, a screen reader user who heard
   * "X is working on this case" is never told that has stopped being true. So once
   * a summary has gone into the live region, the banner's departure says ALL_CLEAR —
   * and if no summary was ever spoken, its departure says nothing, because "nobody
   * else" is not news to someone who was never told there was anybody.
   *
   * Deliberately not @State: it is bookkeeping about what we have rendered, and
   * must not itself cause a render.
   */
  private hasAnnounced = false;

  private settleTimer?: ReturnType<typeof setTimeout>;

  // connectedCallback, NOT componentDidLoad: an element moved in the DOM is
  // disconnected and reconnected but never loaded again, so a timer cleared on
  // disconnect would never be restarted and the region would stay silent for good.
  connectedCallback() {
    if (!this.liveRegionReady && this.settleTimer === undefined) {
      this.settleTimer = setTimeout(() => {
        this.settleTimer = undefined;
        this.liveRegionReady = true;
      }, LIVE_REGION_SETTLE_MS);
    }
  }

  disconnectedCallback() {
    clearTimeout(this.settleTimer);
    this.settleTimer = undefined;
  }

  private announce(summary: string) {
    if (!this.liveRegionReady) {
      return "";
    }
    this.hasAnnounced = true;
    return summary;
  }

  private announceAllClear() {
    return this.liveRegionReady && this.hasAnnounced ? ALL_CLEAR : "";
  }

  private renderWithLiveRegion(announcement = "", banner?: VNode) {
    return (
      <Host>
        <div class="govuk-visually-hidden" role="status">
          {announcement}
        </div>
        {banner}
      </Host>
    );
  }

  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth", "caseDetails"]);
    if (!isReady) {
      return this.renderWithLiveRegion();
    }
    // Presence REGISTRATION is deliberately NOT gated here — we want the hub and
    // the API exercised by real traffic in QA. This gates only the manifestation,
    // so a caseworker does not discover a banner mid-work while we are still
    // building it. See caseLockingNotifications in Preview.ts.
    if (!FEATURE_FLAGS.shouldShowCaseLockingNotifications(state)) {
      return this.renderWithLiveRegion();
    }
    const present = state.caseLockingPresentUsers;
    // EITHER IS ENOUGH. A lock with nobody present is the ordinary result of someone
    // closing their browser on the Classic case screen — the lock outlives the
    // session — and it is the more consequential of the two facts, so it must be
    // able to raise this banner on its own.
    const lock = getCaseLock(state.caseDetails);
    const locked = !!lock?.locked;
    if ((!present || present.sections.length === 0) && !locked) {
      return this.renderWithLiveRegion(this.announceAllClear());
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
    // THE WORDING, AND THE REASONING THAT PRODUCED IT, ARE SHARED. Why "other"
    // disappears when the count includes the reader, why the lock leads and
    // presence follows as a subordinate clause, and why we never say "editing" or
    // "viewing" — all of it now sits beside the sentences in CCPContent.summary,
    // which the Classic and Modern clients call too. This is the only UI that can
    // pass `locked`: the other two have no route to the case-details API.
    const summary = CCPContent.summary(people, includesSelf, locked);

    return this.renderWithLiveRegion(
      this.announce(summary),
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
              // "RCMS since 3.38pm on 8 September 2026", one clause per application,
              // assembled by the shared content module so Modern and Classic read
              // the same. formatJoined is passed in rather than imported there,
              // because the words are shared but the clock is not.
              const where = CCPContent.where(person.apps, formatJoined);
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
                <p class="govuk-body">{CCPContent.personLine(CCPPeople.displayName(person), sections, where)}</p>
              );
            })}
          </div>
        ))}
      </cps-global-pinned-notification>,
    );
  }
}
