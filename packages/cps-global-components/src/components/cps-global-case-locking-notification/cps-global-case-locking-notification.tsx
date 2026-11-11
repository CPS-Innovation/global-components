import { Component, h, Host, State, VNode } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { formatJoined } from "../../services/case-locking/format-joined";
import { CCPContent, CCPView } from "cps-global-presence";
import { CaseLockingPresentSection } from "../../services/case-locking/CaseLockingPresentUsers";
import { describeCaseLock, getCaseLock } from "../../services/case-locking/get-case-lock";

// The API's records are denormalised (one per user, per section, per application);
// CCPView collapses them to one line per person, exactly as the Classic and Modern
// clients do.
const toMembers = (sections: CaseLockingPresentSection[]) =>
  sections.flatMap(section =>
    section.users.map(user => ({ userEmail: user.user, sourceApplication: user.appName, joinedAt: user.joinedAt, sections: user.sections })),
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
    // No separate "show" flag: whether anyone is reported is decided by who is on
    // the case, and whether the reader counts is caseLockingCountSelf. See
    // feature-flags.ts.
    if (!FEATURE_FLAGS.shouldEnableCaseLocking(state)) {
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

    // WHO IS READING, so their row can be marked. Narrowed rather than
    // optional-chained: only the authenticated arm of AuthResult has a username.
    // countSelf is true because the presence service has already applied the
    // caseLockingCountSelf preview flag; what reaches the store is what to show.
    const viewer = state.auth?.isAuthed ? state.auth.username : undefined;
    // The lock leads the summary and presence follows; only this UI can pass
    // `locked`, because the legacy clients have no route to the case-details API.
    const view = CCPView.build({
      members: toMembers(present?.sections ?? []),
      viewerEmail: viewer,
      countSelf: true,
      locked,
      formatTime: formatJoined,
    });
    const summary = view.summary;

    return this.renderWithLiveRegion(
      this.announce(summary),
      <cps-global-pinned-notification titleText={summary} collapsible dismissible={false}>
        {/* FIRST IN THE BODY, above the roster, for the same reason it leads the
            heading. The name is whatever CMS recorded; we make no attempt to match it
            to the people in the roster below — that reconciliation is a separate
            problem and a wrong guess would read worse than two unjoined facts. */}
        {locked && <p class="govuk-body">{describeCaseLock(lock)}</p>}
        {view.lines.map(line => (
          <p class="govuk-body">{line}</p>
        ))}
      </cps-global-pinned-notification>,
    );
  }
}
