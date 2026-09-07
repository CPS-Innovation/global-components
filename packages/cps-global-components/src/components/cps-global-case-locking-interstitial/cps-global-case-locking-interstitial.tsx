import { Component, h, State, Element, Listen } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

/**
 * The interruption, from the UCD prototype's moj-interruption-card.
 *
 * WE REPLACE THE PAGE'S CONTENT RATHER THAN COVER IT.
 * In the prototype this card is rendered INSIDE <main>: the server simply does
 * not send the case, so the card is the page's content, in normal flow, with the
 * header and footer still around it.
 *
 * Two earlier attempts tried to imitate that from outside, and both failed in
 * ways worth recording. A modal <dialog> renders in the TOP LAYER, so it covers
 * the header and footer the design keeps. A fixed overlay band, measured to sit
 * between our header and our footer, is what actually shipped — and a fixed sheet
 * over a live page betrays itself however it is styled: it grew its own
 * scrollbar, and it visibly shifted as the page was dragged underneath it.
 *
 * So we do what the prototype does. The host's content is HIDDEN and the card
 * renders in the ordinary document flow, inside cps-global-header where this
 * component already lives. There is nothing to measure, nothing to keep in sync
 * with scrolling, no z-index and no second scrollbar — the page is simply
 * shorter while the interruption is up.
 *
 * WE MUTATE HOST DOM HERE, WHICH WE OTHERWISE AVOID. It is confined to inline
 * `display` on the direct children of <body>, with each previous inline value
 * captured so release restores exactly what was there. Every path that hides the
 * card releases it, including disconnectedCallback — a host app that tears us
 * down mid-interruption must not be left with an invisible page.
 *
 * WHAT IS SPARED: our own subtree, and the subtree containing cps-global-footer.
 * Both are found by walking up from elements of OURS, never by guessing at the
 * host's markup — hunting for the host's own header or footer by selector is the
 * fragility that has cost us twice elsewhere.
 *
 * ACCESSIBILITY
 * role="alertdialog" is the role for an interruption that demands a decision, and
 * focus moves into it so assistive tech announces it rather than leaving it to be
 * discovered. Hiding the host content with `display: none` takes it out of the
 * accessibility tree and the tab order in one move, so aria-modal is an honest
 * claim; our own chrome, which stays visible, is made inert for the same reason.
 * Escape dismisses, and focus returns to wherever it came from.
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

  private currentCode?: string;
  private inerted: HTMLElement[] = [];
  /**
   * Host elements we hid, with the inline `display` each had before we did.
   *
   * NOT NAMED `hidden`. In the rollup bundle the component class IS the custom
   * element, so a field called `hidden` resolves to HTMLElement.prototype.hidden:
   * assigning an array to it coerces to `true`, which hides this very element and
   * makes every later call on it throw "forEach is not a function". The dev
   * server keeps the instance separate from the element, so it fails only in the
   * shipped build — an e2e test caught it, and nothing in the dev harness would
   * have. Worth checking any new field name against HTMLElement's own properties.
   */
  private hiddenHostElements: { el: HTMLElement; display: string }[] = [];
  /** The footer's inline position properties, captured before we pinned it. */
  private footerStyle?: { el: HTMLElement; position: string; left: string; right: string; bottom: string };
  private showing = false;
  /** Where focus was before we took it. Restored only on a user-initiated exit. */
  private focusedBeforeShowing: HTMLElement | null = null;

  disconnectedCallback() {
    this.release();
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
      this.hideHostContent();
      this.pinFooter();
      this.inertOwnChrome();
      this.takeFocus();
    }
  }

  /**
   * Hide the page, keeping our own chrome and our footer.
   *
   * `display: none` rather than `inert`: it removes the content visually, from
   * the accessibility tree and from the tab order in one attribute, which is the
   * whole job. The card then occupies the space in normal flow.
   *
   * WALKS THE ANCESTOR CHAIN rather than hiding <body>'s children, because our
   * header is not necessarily a child of <body>. Where a host nests it in a
   * container alongside page content — as the dev harness does — sparing "our
   * subtree" would spare that content too, and the case stays on screen behind
   * the interruption. Hiding the siblings at EVERY level from our host element up
   * to <body> leaves exactly one visible branch: the one we are in.
   *
   * The walk starts at our shadow HOST, not at this element: siblings inside
   * cps-global-header's shadow root are our own chrome, which the design keeps
   * visible (and inertOwnChrome makes unreachable).
   *
   * Only elements can be hidden this way. A bare text node sitting next to the
   * header has no style to set and will survive — real host apps wrap their
   * content, but it is why the dev harness needed its stray text wrapping.
   */
  private hideHostContent() {
    // Never hide the branch the footer sits in, wherever the host has anchored it.
    const footerChain = this.ancestorChain(document.querySelector("cps-global-footer"));
    let node: Element | null = this.shadowHost() ?? this.el;
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement;
      if (!parent) {
        return;
      }
      const current = node;
      Array.from(parent.children).forEach(child => {
        const el = child as HTMLElement;
        if (el === current || footerChain.has(el) || el.style.display === "none") {
          return;
        }
        this.hiddenHostElements.push({ el, display: el.style.display });
        el.style.display = "none";
      });
      node = parent;
    }
  }

  /** Every element from `from` up to and including <body>. */
  private ancestorChain(from: Element | null): Set<Element> {
    const chain = new Set<Element>();
    let node: Element | null = from;
    while (node) {
      chain.add(node);
      node = node.parentElement;
    }
    return chain;
  }

  /** The element hosting the shadow root we render inside — cps-global-header. */
  private shadowHost(): Element | null {
    let node: Node | null = this.el;
    while (node) {
      const parent: Node | null = node.parentNode;
      if (parent instanceof ShadowRoot) {
        return parent.host;
      }
      node = parent;
    }
    return null;
  }

  /**
   * Our own chrome stays VISIBLE — the design keeps the header — but must not
   * stay reachable, or the keyboard could tab into the global menu while
   * aria-modal tells assistive tech that everything outside the card is
   * unavailable. Visible is not the same as usable; the card offers "Go back"
   * for the user who wants out.
   *
   * THE PINNED BANNER IS THE EXCEPTION, and is hidden rather than inerted. It
   * reports the same presence this card is interrupting about, so while the card
   * is up it is a second copy of the message — and an inert one, which reads as
   * broken: its "Show details" toggle is visibly there but cannot be clicked or
   * tabbed to. Hiding it leaves one thing to act on, which is the point of an
   * interruption. It comes back on dismissal, via the same release() that
   * restores everything else, and resumes its role as the ongoing informational
   * channel.
   */
  private inertOwnChrome() {
    Array.from(this.el.parentElement?.children ?? []).forEach(child => {
      const el = child as HTMLElement;
      if (el === this.el) {
        return;
      }
      if (el.tagName.toLowerCase() === "cps-global-case-locking-notification") {
        if (el.style.display !== "none") {
          this.hiddenHostElements.push({ el, display: el.style.display });
          el.style.display = "none";
        }
        return; // display:none already removes it from the tree and the tab order
      }
      if (el.inert) {
        return; // already inert for someone else's reasons — leave alone
      }
      el.inert = true;
      this.inerted.push(el);
    });
  }

  private release() {
    this.inerted.forEach(el => (el.inert = false));
    this.inerted = [];
    this.hiddenHostElements.forEach(({ el, display }) => (el.style.display = display));
    this.hiddenHostElements = [];
    this.unpinFooter();
    this.showing = false;
  }

  /**
   * PIN THE FOOTER TO THE BOTTOM OF THE VIEWPORT while the interruption is up.
   *
   * With the page's content hidden, the document becomes as short as the card —
   * so the footer rides up directly beneath it and the two sit stranded together
   * in the top half of the screen, with the whole footer's worth of links looming
   * under a short message. Pinning it puts the page back into the shape the user
   * expects: header, the interruption, white space, footer at the foot.
   *
   * Only the four positioning properties are captured and restored, NOT the whole
   * style attribute: footer-subscriber writes a synced width onto this same
   * element, and restoring wholesale would clobber whatever it had set while we
   * were up.
   */
  private pinFooter() {
    const footer = document.querySelector<HTMLElement>("cps-global-footer");
    if (!footer || this.footerStyle) {
      return;
    }
    // A footer the host already fixes to the viewport never rides up when the
    // content goes, so there is nothing to pin — and writing `bottom` here would
    // fight cps-global-pinned-notification, which raises a fixed footer by its
    // own height to sit beneath it. Leave it alone and let that component own the
    // offset.
    const position = getComputedStyle(footer).position;
    if (position === "fixed" || position === "sticky") {
      return;
    }
    this.footerStyle = {
      el: footer,
      position: footer.style.position,
      left: footer.style.left,
      right: footer.style.right,
      bottom: footer.style.bottom,
    };
    footer.style.position = "fixed";
    footer.style.left = "0";
    footer.style.right = "0";
    footer.style.bottom = "0";
  }

  private unpinFooter() {
    const previous = this.footerStyle;
    this.footerStyle = undefined;
    if (!previous) {
      return;
    }
    previous.el.style.position = previous.position;
    previous.el.style.left = previous.left;
    previous.el.style.right = previous.right;
    previous.el.style.bottom = previous.bottom;
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
   * whatever the user had moved on to, seemingly at random.
   *
   * Ordering matters: release() restores the page first, because focus() on a
   * hidden element does nothing. The isConnected guard covers the element having
   * been removed by a host re-render while we were up.
   */
  private restoreFocus() {
    const target = this.focusedBeforeShowing;
    this.focusedBeforeShowing = null;
    if (target?.isConnected) {
      target.focus();
    }
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
      >
        {/* The prototype's own structure: width container > main wrapper > grid
            row > full-width-from-desktop column > card. These carry GDS spacing
            and width rules, so dropping them (as an earlier version did) makes
            the card the wrong width with the wrong rhythm. */}
        <div class="govuk-width-container">
          <div class="govuk-main-wrapper">
            <div class="govuk-grid-row">
              <div class="govuk-grid-column-full-from-desktop">
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
