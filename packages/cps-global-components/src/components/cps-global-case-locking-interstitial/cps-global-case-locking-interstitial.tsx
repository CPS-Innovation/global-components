import { Component, h, State, Element, Listen } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";
import { MIN_REAL_HEADER_WIDTH_PX } from "../../services/browser/dom/footer-subscriber";

/**
 * The interruption, rebuilt as a top-layer dialog.
 *
 * WHY REPLACE THE PAGE RATHER THAN EDIT IT
 * Three earlier versions tried to imitate an interruption from outside, and each
 * was wrong in a way that only showed up on a real page: a fixed overlay band
 * measured between our header and footer grew its own scrollbar and visibly
 * shifted when the page was dragged; hiding the host's content element by element
 * worked until the host changed the page underneath us.
 *
 * That last one is worth spelling out, because it looked correct. It walked the
 * DOM setting `display: none` on element siblings up the ancestor chain and
 * remembered each one so it could be put back — a snapshot of a page that does not
 * hold still. Content the host added afterwards was never hidden, a subtree it
 * re-rendered came back, and a `display` it set while we were up got clobbered on
 * restore.
 *
 * showModal() sidesteps the whole category. The browser puts this in the top
 * layer, makes the rest of the document inert — out of the accessibility tree and
 * the tab order — traps focus, handles Escape, and RESTORES FOCUS on close. We
 * touch no host DOM at all, so there is nothing to remember and nothing to undo.
 *
 * WHY THE CHROME IS IN HERE
 * The top layer covers everything, including our own header and footer, and the
 * design keeps them. So the dialog carries its own: cps-global-header in
 * chrome-only mode, and cps-global-footer-content. Whole components, not a
 * reassembly of their parts — the theme classes, custom host CSS, error fallback
 * and ordering stay owned by the header, and cannot drift from it.
 *
 * ...AND WHY IT IS HIDDEN FROM ASSISTIVE TECH
 * Visually the chrome is context. To a screen reader it would be a full
 * navigation menu and a footer sitting between the user and the decision, read
 * out before the message and joining the tab order of an interruption that is
 * meant to have two exits. `inert` plus `aria-hidden` makes it what it actually
 * is: decoration. The only thing exposed in here is the choice.
 *
 * The card is also FIRST in the DOM, with the chrome placed visually by flex
 * `order`, so reading order starts at the message.
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
  private showing = false;
  private headerObserver?: ResizeObserver;
  /** The document's inline `overflow` before we hid its scrollbar. */
  private previousOverflow: string | null = null;

  disconnectedCallback() {
    this.close();
  }

  /**
   * Escape reaches us as the dialog's own `cancel` event rather than a keydown,
   * because the browser is handling it. Routing it through dismiss() rather than
   * letting the default close happen keeps the dismissal latch in step — closing
   * without recording it would re-raise the interruption on the next poll.
   */
  @Listen("cancel")
  onCancel(event: Event) {
    event.preventDefault();
    this.dismiss();
  }

  componentDidRender() {
    const dialog = this.dialog();
    if (dialog && !this.showing) {
      this.showing = true;
      this.paintSurface(dialog);
      dialog.showModal();
      this.hidePageScrollbar();
      this.syncChromeWidth();
    }
  }

  private dialog = () => this.el.querySelector<HTMLDialogElement>("dialog");

  /**
   * TAKE THE PAGE'S OWN SURFACE COLOUR.
   *
   * A top-layer dialog has nothing behind it to inherit from, so it must paint
   * its own background — and a hardcoded white is exactly what we removed from
   * the original, because the estate has custom dark-mode code that rewrites the
   * DOM's colours and never sees a value baked into our stylesheet.
   *
   * Reading body's computed background at open time inherits whatever that code
   * has already decided, without coupling us to how it works. Canvas — the CSS
   * system colour, which follows the user's colour scheme — is the fallback for a
   * transparent body, which is the common case on a page that never set one.
   */
  private paintSurface(dialog: HTMLDialogElement) {
    const bodyBackground = getComputedStyle(document.body).backgroundColor;
    const isTransparent = !bodyBackground || bodyBackground === "transparent" || bodyBackground === "rgba(0, 0, 0, 0)";
    dialog.style.background = isTransparent ? "Canvas" : bodyBackground;
  }

  /**
   * GIVE THE CHROME THE PAGE'S CONTENT WIDTH.
   *
   * Neither the header nor the footer uses govuk-width-container — on a real page
   * they take their width from whatever container the host puts them in. Inside a
   * viewport-filling dialog there is no such container, so left alone they run the
   * full width of the screen and stop looking like the page they are imitating.
   *
   * The measurement comes from the REAL header still laid out on the page behind
   * us. document.querySelector finds only that one: our copy lives inside the
   * outer header's shadow root, so document-level queries cannot see it.
   *
   * The threshold is shared with footer-subscriber, which syncs the real footer to
   * the real header for the same reason and against the same hazard: during a host
   * SPA route change the header is briefly zero-sized, and an unguarded sync
   * writes width:0 and collapses everything.
   */
  private syncChromeWidth() {
    const outerHeader = document.querySelector<HTMLElement>("cps-global-header");
    if (!outerHeader) {
      return;
    }
    if (!this.headerObserver && typeof ResizeObserver !== "undefined") {
      this.headerObserver = new ResizeObserver(() => this.syncChromeWidth());
      this.headerObserver.observe(outerHeader);
    }
    const width = outerHeader.getBoundingClientRect().width;
    if (width < MIN_REAL_HEADER_WIDTH_PX) {
      return; // transient mid-navigation value — keep the last good width
    }
    this.el.querySelectorAll<HTMLElement>(".app-interruption__chrome").forEach(chrome => {
      chrome.style.width = `${width}px`;
    });
  }

  /**
   * HIDE THE PAGE'S SCROLLBAR while the dialog is up.
   *
   * showModal() makes the document inert but does not stop it scrolling, so the
   * page keeps a scrollbar sized to content nobody can see — it reports the height
   * of the case behind the interruption, which is both meaningless and a way to
   * scroll the dialog's backdrop away from under it.
   *
   * THIS IS HOST DOM, and deliberately the least of it: one named property on the
   * document root, with the previous inline value captured so close() restores
   * exactly what was there, including "not set at all". It is not the earlier
   * approach of enumerating the host's elements — there is nothing here to go
   * stale when the page changes underneath us.
   *
   * ASSUMES THE DOCUMENT IS WHAT SCROLLS. A host that scrolls an inner container
   * keeps its scrollbar; overscroll-behavior on the dialog still stops the wheel
   * reaching it, so the result is cosmetic rather than broken.
   */
  private hidePageScrollbar() {
    if (this.previousOverflow !== null) {
      return; // already hidden — never capture our own value as the host's
    }
    const root = document.documentElement;
    this.previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
  }

  private restorePageScrollbar() {
    if (this.previousOverflow === null) {
      return;
    }
    document.documentElement.style.overflow = this.previousOverflow;
    this.previousOverflow = null;
  }

  private close() {
    const dialog = this.dialog();
    if (dialog?.open) {
      dialog.close(); // the browser restores focus to wherever it was
    }
    this.headerObserver?.disconnect();
    this.headerObserver = undefined;
    this.restorePageScrollbar();
    this.showing = false;
  }

  private dismiss = () => {
    this.close();
    this.dismissedFor = this.currentCode ?? "";
  };

  private goBack = () => {
    this.dismiss();
    window.history.back();
  };

  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth", "tags"]);
    if (!isReady || !FEATURE_FLAGS.shouldShowCaseLockingInterstitial(state)) {
      this.close();
      return null;
    }
    const present = state.caseLockingPresentUsers;
    // Only sections that were ALREADY OCCUPIED when we arrived interrupt. Someone
    // joining a section we are already in is not an interruption for us — we are
    // the one who was here first, and they are the one being shown this card.
    const sections = present?.sections.filter(section => section.occupiedOnEntry) ?? [];
    if (sections.length === 0) {
      this.close();
      return null;
    }
    const key = sections
      .map(section => section.code)
      .sort((a, b) => a.localeCompare(b))
      .join(",");
    if (this.dismissedFor === key) {
      this.close();
      return null;
    }

    this.currentCode = key;
    const names = Array.from(new Set(sections.flatMap(section => section.users.map(user => user.user))));
    const who = names.join(", ");

    return (
      <dialog class="app-interruption" role="alertdialog" aria-labelledby="cps-interruption-heading" aria-describedby="cps-interruption-body">
        {/* FIRST in the DOM so reading order starts at the message; flex `order`
            puts it between the chrome visually. */}
        <main class="app-interruption__main">
          <div class="govuk-width-container">
            <div class="govuk-main-wrapper">
              <div class="govuk-grid-row">
                <div class="govuk-grid-column-full-from-desktop">
                  <div class="moj-interruption-card">
                    <div class="moj-interruption-card__content">
                      <h1 class="moj-interruption-card__heading" id="cps-interruption-heading">
                        Someone else is working on this case
                      </h1>
                      {/* Wording is deliberately plain. The presence API tells us who is
                          in a section and when they arrived — NOT whether they are
                          editing, nor whether it is safe to proceed. */}
                      <div class="moj-interruption-card__body" id="cps-interruption-body">
                        <p>{who} is also working on this case.</p>
                        <p>If you both make changes, one set of changes could be lost.</p>
                      </div>
                      <div class="govuk-button-group moj-interruption-card__actions">
                        <button type="button" class="govuk-button govuk-button--inverse" autofocus onClick={this.dismiss}>
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
        </main>

        {/* Decoration. See the note at the top of this file: to assistive tech the
            only thing in this dialog is the choice above. */}
        <div class="app-interruption__chrome app-interruption__chrome--header" aria-hidden="true" ref={el => el && (el.inert = true)}>
          <cps-global-header chromeOnly={true}></cps-global-header>
        </div>
        <div class="app-interruption__chrome app-interruption__chrome--footer" aria-hidden="true" ref={el => el && (el.inert = true)}>
          <cps-global-footer-content></cps-global-footer-content>
        </div>
      </dialog>
    );
  }
}
