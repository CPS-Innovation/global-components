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
 * THE PAGE IS FROZEN WHILE WE ARE UP
 * An overlay over a page that still scrolls reads as a floating panel, however
 * it is styled. Locking the document's overflow means nothing behind us can
 * move, so the band reads as the page rather than as a sheet on top of it — and
 * with nothing moving there is nothing to re-measure on scroll either.
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
  private previousOverflow: string | null = null;
  private previousPaddingRight: string | null = null;
  private headerObserver?: ResizeObserver;
  /** Where focus was before we took it. Restored only on a user-initiated exit. */
  private focusedBeforeShowing: HTMLElement | null = null;

  disconnectedCallback() {
    this.release();
  }

  @Listen("resize", { target: "window" })
  onResize() {
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
      this.lockScroll();
      this.applyInert();
      this.takeFocus();
      // MEASURE AGAIN AFTER THE FRAME SETTLES, and never delete this.
      // componentDidRender runs before our own styles have applied, so at that
      // moment this component is still IN FLOW inside cps-global-header and
      // inflates the header's box — measured live, a header whose chrome ends at
      // 109px reported a bottom of 244px. The band then starts 135px too low and
      // the page shows through above it.
      //
      // Once the styles land we collapse to zero height and the header is 109px
      // again, so a second measurement on the next frame is correct. This used to
      // be masked by the scroll listener, which corrected it on the first scroll;
      // that listener went when the page scroll was locked.
      requestAnimationFrame(() => {
        if (this.showing) {
          this.measure();
        }
      });
      this.observeHeader();
    }
  }

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

  // The header's height is not fixed: the second-level menu appears and
  // disappears, the case-details strip arrives asynchronously, notifications come
  // and go. None of those fire a window resize, and with the page scroll locked
  // there is no scroll event to correct us either — so without this the band's top
  // edge would silently go stale, which is the bug we just fixed in a slower form.
  private observeHeader() {
    if (this.headerObserver || typeof ResizeObserver === "undefined") {
      return;
    }
    const header = document.querySelector("cps-global-header");
    if (!header) {
      return;
    }
    this.headerObserver = new ResizeObserver(() => {
      if (this.showing) {
        this.measure();
      }
    });
    this.headerObserver.observe(header);
  }

  /**
   * FOCUS THE DIALOG ITSELF, not the first button.
   *
   * role="alertdialog" is announced when focus enters it, so something in here
   * must take focus or an assistive-tech user is told nothing at all. Focusing
   * the container rather than "Continue anyway" means the screen reader reads the
   * dialog's name and description before the user reaches the actions — and it
   * leaves no button armed for a reflexive Enter, which for a warning is a
   * feature rather than an inconvenience.
   *
   * The container carries tabindex="-1" so it can be focused programmatically
   * without joining the tab order. Falling back to the button covers the case
   * where the container somehow cannot take focus; between them, focus can never
   * be left stranded on a page that is now entirely inert.
   */
  private takeFocus() {
    const active = document.activeElement;
    this.focusedBeforeShowing = active instanceof HTMLElement ? active : null;
    const dialog = this.el.querySelector<HTMLElement>(".app-interruption");
    dialog?.focus();
    if (document.activeElement !== dialog) {
      this.el.querySelector<HTMLElement>(".govuk-button")?.focus();
    }
  }

  /**
   * Give focus back to whatever had it before we interrupted.
   *
   * ONLY ON A USER-INITIATED EXIT — dismiss, go back, Escape. release() also runs
   * on incidental teardown (the flag going off, presence emptying, the component
   * being torn down), and restoring focus there would yank the caret out of
   * whatever the user had moved on to, seemingly at random, whenever a roster
   * happened to empty.
   *
   * Ordering matters: release() clears inert first, because focus() on an inert
   * element silently does nothing. The isConnected guard covers the element
   * having been removed by a host re-render while we were up.
   */
  private restoreFocus() {
    const target = this.focusedBeforeShowing;
    this.focusedBeforeShowing = null;
    if (target?.isConnected) {
      target.focus();
    }
  }

  private applyInert() {
    // The host page: everything under <body> except the subtree we live in.
    const ourRoot = this.rootChildOfBody();
    this.inertAll(Array.from(document.body.children), ourRoot);

    // OUR OWN CHROME, which the line above necessarily spares. We render inside
    // cps-global-header's shadow root, as a sibling of the banner, the menu, the
    // notifications and the pinned banner — so excluding our subtree from the
    // page-level pass leaves the entire header reachable by keyboard. Tabbing out
    // of the interruption and into the global menu, while aria-modal="true" tells
    // assistive tech that everything outside the dialog is unavailable, is the
    // ARIA lying about what the keyboard can actually do.
    //
    // The design keeps the header VISIBLE, which is not the same as usable: the
    // card offers "Go back" for the user who wants out.
    this.inertAll(Array.from(this.el.parentElement?.children ?? []), this.el);
  }

  private inertAll(candidates: Element[], keep: Element | null) {
    candidates.forEach(child => {
      const el = child as HTMLElement;
      if (el === keep || el.inert) {
        return; // ours, or already inert for someone else's reasons — leave alone
      }
      el.inert = true;
      this.inerted.push(el);
    });
  }

  private release() {
    this.inerted.forEach(el => (el.inert = false));
    this.inerted = [];
    this.unlockScroll();
    this.headerObserver?.disconnect();
    this.headerObserver = undefined;
    this.showing = false;
  }

  // WHY LOCK THE PAGE
  // Without this the host page scrolls behind a stationary sheet, which is what
  // makes the interruption read as a floating panel rather than as the content
  // of the page. Locking the document freezes what is behind us, so the only
  // thing on screen that can move is the interruption itself.
  //
  // It also removes the need to re-measure on scroll: the band's edges can only
  // change on resize now, so the drifting top edge goes away with it.
  //
  // The scrollbar disappearing would reflow the page a few pixels wider, a jump
  // the eye reads as the page "jolting" underneath. Replacing its width with
  // padding keeps the layout still. Both previous inline values are captured so
  // release() restores exactly what the host had, including "not set at all".
  private lockScroll() {
    const root = document.documentElement;
    if (this.previousOverflow !== null) {
      return; // already locked — never capture our own values as the host's
    }
    const scrollbarWidth = window.innerWidth - root.clientWidth;
    this.previousOverflow = root.style.overflow;
    this.previousPaddingRight = root.style.paddingRight;
    root.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      root.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  private unlockScroll() {
    if (this.previousOverflow === null) {
      return;
    }
    const root = document.documentElement;
    root.style.overflow = this.previousOverflow;
    root.style.paddingRight = this.previousPaddingRight ?? "";
    this.previousOverflow = null;
    this.previousPaddingRight = null;
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

  // The user-initiated exit, and the only path that hands focus back.
  private dismiss = () => {
    this.release();
    this.restoreFocus();
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
    // Only sections that were ALREADY OCCUPIED when we arrived interrupt. Someone
    // joining a section we are already in is not an interruption for us — we are
    // the one who was here first, and they are the one being shown this card. Two
    // people on a case therefore produce exactly one interruption, not two.
    // Everyone else is reported by the pinned banner, which shows all sections.
    const sections = present?.sections.filter(section => section.occupiedOnEntry) ?? [];
    if (sections.length === 0) {
      this.release();
      return null;
    }
    // Keyed on the whole set of sections: a different combination is a different
    // interruption, and dismissing one should not silence the next. Sorted with an
    // explicit comparator so the key is stable — a bare sort() orders by string
    // conversion, which happens to work for these codes but is not something to
    // rely on for a value used as an identity.
    const key = sections
      .map(section => section.code)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
    if (this.dismissedFor === key) {
      this.release();
      return null;
    }

    this.currentCode = key;
    const urn = state.tags?.urn;
    const names = Array.from(new Set(sections.flatMap(section => section.users.map(user => user.user))));
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
        // Focusable programmatically, but never in the tab order: focus enters
        // the dialog so it is announced, and leaves via the actions inside it.
        tabindex={-1}
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
