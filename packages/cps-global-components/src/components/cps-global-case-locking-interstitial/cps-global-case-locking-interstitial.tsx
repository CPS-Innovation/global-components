import { Component, h, State, Element, Listen } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

/**
 * The interruption, from the UCD prototype's moj-interruption-card.
 *
 * WHY NOT A MODAL <dialog>
 * showModal() is the tidy answer to "block the page accessibly" — the browser
 * inerts the whole document, traps focus and supplies a backdrop, all without
 * touching the host's DOM. But it puts the dialog in the TOP LAYER, which covers
 * everything, and the design keeps the header and footer visible. So we do it
 * ourselves: an overlay occupying the band below the header, plus `inert` on the
 * host's content.
 *
 * WHAT `inert` BUYS
 * Covering the page visually is not enough. Without it a screen reader still
 * reads the case underneath and the keyboard still tabs into it — the user is
 * told to stop while the page quietly says otherwise. `inert` removes those
 * elements from the accessibility tree AND the tab order in one attribute.
 *
 * WE MUTATE HOST DOM HERE, WHICH WE OTHERWISE AVOID. It is confined to setting
 * and clearing `inert` on the direct children of <body>, excluding our own root,
 * and every path that hides the overlay releases it — including
 * disconnectedCallback, because a host app that tears us down mid-interruption
 * must not be left with an unusable page.
 *
 * ACCESSIBILITY
 * role="alertdialog" is the role for an interruption that demands a decision.
 * Focus moves into the card when it appears, so assistive tech announces it
 * rather than leaving it to be discovered, and Escape dismisses — both choices
 * are visible, so trapping the keyboard would cost more than it buys.
 */
@Component({
  tag: "cps-global-case-locking-interstitial",
  styleUrl: "cps-global-case-locking-interstitial.scss",
  shadow: false,
})
export class CpsGlobalCaseLockingInterstitial {
  @Element() el: HTMLElement;

  /**
   * The region code we have been dismissed for. Without this the interruption
   * would reappear on the next poll, every poll, which is unusable. Re-arms when
   * the code changes — a different section is a different interruption.
   */
  @State() dismissedFor?: string;

  /** Distance from the top of the viewport to the bottom of our header. */
  @State() topOffset: number = 0;

  /** Distance from the bottom of the viewport to the top of our footer, when it
   * is on screen. Zero when the footer is below the fold or absent. */
  @State() bottomOffset: number = 0;

  private currentCode?: string;
  private inerted: HTMLElement[] = [];
  private showing = false;

  disconnectedCallback() {
    this.release();
  }

  @Listen("resize", { target: "window" })
  onResize() {
    if (this.showing) {
      this.measure();
    }
  }

  // The footer moves relative to the viewport as the page scrolls, so the band's
  // lower edge has to follow it.
  @Listen("scroll", { target: "window" })
  onScroll() {
    if (this.showing) {
      this.measure();
    }
  }

  @Listen("keydown", { target: "document" })
  onKeyDown(event: KeyboardEvent) {
    if (this.showing && event.key === "Escape") {
      this.dismiss();
    }
  }

  componentDidRender() {
    const card = this.el.querySelector<HTMLElement>(".moj-interruption-card");
    if (card && !this.showing) {
      this.showing = true;
      this.measure();
      this.applyInert();
      this.el.querySelector<HTMLElement>(".govuk-button")?.focus();
    }
  }

  // The band starts where our header ends. Measured rather than assumed: the
  // header's height varies with the rebrand, the case-details strip and whether
  // the second-level menu is showing.
  // The band runs from the bottom of our header to the top of our footer. Both
  // are measured rather than assumed: the header's height varies with the
  // rebrand, the case-details strip and the second-level menu, and the footer may
  // be absent, below the fold, or on screen.
  //
  // Only OUR chrome is measured. The host's own header and footer are not ours to
  // find, and hunting for them by selector is the fragility that has already cost
  // us twice.
  private measure() {
    const header = document.querySelector("cps-global-header");
    this.topOffset = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;

    const footer = document.querySelector("cps-global-footer-content");
    const rect = footer?.getBoundingClientRect();
    this.bottomOffset = rect && rect.height > 0 ? Math.max(0, window.innerHeight - rect.top) : 0;
  }

  private applyInert() {
    const ourRoot = this.rootChildOfBody();
    Array.from(document.body.children).forEach(child => {
      const el = child as HTMLElement;
      if (el === ourRoot || el.inert) {
        return; // ours, or already inert for someone else's reasons — leave alone
      }
      el.inert = true;
      this.inerted.push(el);
    });
  }

  private release() {
    this.inerted.forEach(el => (el.inert = false));
    this.inerted = [];
    this.showing = false;
  }

  // Our own top-level ancestor, walking out through shadow boundaries — this
  // component sits inside cps-global-header's shadow root.
  private rootChildOfBody(): Element | null {
    let node: Node | null = this.el;
    while (node) {
      const parent: Node | null = node.parentNode;
      if (parent === document.body) {
        return node as Element;
      }
      node = parent instanceof ShadowRoot ? parent.host : parent;
    }
    return null;
  }

  private dismiss = () => {
    this.release();
    this.dismissedFor = this.currentCode ?? "";
  };

  private goBack = () => {
    this.dismiss();
    window.history.back();
  };

  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth", "tags"]);
    if (!isReady || !FEATURE_FLAGS.shouldShowCaseLockingInterstitial(state)) {
      this.release();
      return null;
    }
    const present = state.caseLockingPresentUsers;
    if (!present || present.sections.length === 0) {
      this.release();
      return null;
    }
    // Keyed on the whole set of sections: a different combination is a different
    // interruption, and dismissing one should not silence the next.
    const key = present.sections.map(section => section.code).sort().join(",");
    if (this.dismissedFor === key) {
      this.release();
      return null;
    }

    this.currentCode = key;
    const urn = state.tags?.urn;
    const names = Array.from(new Set(present.sections.flatMap(section => section.users.map(user => user.user))));
    const who = names.join(", ");

    return (
      // Wording is deliberately plain. The presence API tells us who is in a
      // section and when they arrived — NOT whether they are editing, nor whether
      // it is safe to proceed. The prototype says "is currently editing"; we
      // cannot support that claim yet, so we do not make it.
      <div
        class="app-interruption"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cps-interruption-heading"
        aria-describedby="cps-interruption-body"
        style={{ top: `${this.topOffset}px`, bottom: `${this.bottomOffset}px` }}
      >
        {/* The prototype's own structure: width container > main wrapper > grid
            row > full-width-from-desktop column > card. These carry GDS spacing
            and width rules, so dropping them (as an earlier version did) makes
            the card the wrong width with the wrong rhythm. */}
        <div class="govuk-width-container">
          <div class="govuk-main-wrapper">
            <div class="govuk-grid-row">
              <div class="govuk-grid-column-full-from-desktop">
                {/* The case reference, which the design shows above the card.
                    Taken from our own tags — we cannot read the host page's
                    heading, but we do not need to: the URN is already ours. The
                    page's own name ("Review case") stays beyond us, and that is
                    the only part of the design we drop. */}
                {urn && <span class="govuk-caption-l app-interruption__caption">{urn}</span>}
                <div class="moj-interruption-card">
            <div class="moj-interruption-card__content">
              <h1 class="moj-interruption-card__heading" id="cps-interruption-heading">
                Someone else is working on this case
              </h1>
              <div class="moj-interruption-card__body" id="cps-interruption-body">
                <p>{who} is also working on this case.</p>
                <p>If you both make changes, one set of changes could be lost.</p>
              </div>
              <div class="govuk-button-group moj-interruption-card__actions">
                <button type="button" class="govuk-button govuk-button--inverse" onClick={this.dismiss}>
                  Continue anyway
                </button>
                <button type="button" class="govuk-link govuk-link--inverse app-interruption__link" onClick={this.goBack}>
                  Go back
                </button>
              </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
