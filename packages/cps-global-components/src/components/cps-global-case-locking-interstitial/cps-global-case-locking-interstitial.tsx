import { Component, h, State, Element } from "@stencil/core";
import { readyState } from "../../store/store";
import { FEATURE_FLAGS } from "cps-global-configuration";

/**
 * The interruption, from the UCD prototype's moj-interruption-card.
 *
 * WHY A NATIVE <dialog> RATHER THAN AN OVERLAY DIV
 * In the prototype this card is rendered INSIDE <main>, replacing the page
 * content — the server simply does not send the case. We cannot do that: we are
 * a guest component on a page whose DOM belongs to someone else.
 *
 * showModal() gets us the same effect without touching a single node of theirs.
 * The browser puts the dialog in the top layer and makes the entire rest of the
 * document inert — out of the accessibility tree, unfocusable, unclickable — and
 * gives us the focus trap, the backdrop and Escape handling for free. The
 * alternative (a fixed overlay plus `inert` applied to the host's body children)
 * works, but means mutating and then reliably un-mutating host DOM while their
 * app re-renders underneath us, which is exactly the class of thing that breaks
 * quietly.
 *
 * The cost is that it covers our own header too. UCD's design already answers
 * that: the card carries both exits, so the user is never stranded.
 *
 * ACCESSIBILITY
 * role="alertdialog" is the role for an interruption that demands a decision —
 * a screen reader announces it rather than leaving it to be discovered. It is
 * labelled by the heading and described by the body, and focus moves into it on
 * open (showModal does that, to the first focusable element — here, "Continue").
 * Escape dismisses, deliberately: both choices are visible, so trapping the
 * keyboard would buy nothing and cost a lot.
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

  private dialog?: HTMLDialogElement;

  /** The code the currently-rendered interruption is about. */
  private currentCode?: string;

  componentDidRender() {
    const dialog = this.el.querySelector("dialog") as HTMLDialogElement | null;
    this.dialog = dialog ?? undefined;
    // Rendered but not yet shown: put it in the top layer. When render returns
    // null the element leaves the DOM and the browser closes it for us.
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  private dismiss = () => {
    this.dismissedFor = this.currentCode ?? "";
    this.dialog?.close();
  };

  private goBack = () => {
    this.dismiss();
    window.history.back();
  };

  render() {
    const { isReady, state } = readyState(["caseLockingPresentUsers", "config", "preview", "authHint"], ["auth"]);
    if (!isReady) {
      return null;
    }
    if (!FEATURE_FLAGS.shouldShowCaseLockingInterstitial(state)) {
      return null;
    }
    const present = state.caseLockingPresentUsers;
    if (!present || present.users.length === 0) {
      return null;
    }
    if (this.dismissedFor === present.code) {
      return null;
    }

    this.currentCode = present.code;
    const who = present.users.map(user => user.user).join(", ");

    return (
      // Wording is deliberately plain. The presence API tells us who is in a
      // section and when they arrived — NOT whether they are editing, nor whether
      // it is safe to proceed. The prototype says "is currently editing"; we
      // cannot support that claim yet, so we do not make it.
      <dialog class="app-interruption" role="alertdialog" aria-labelledby="cps-interruption-heading" aria-describedby="cps-interruption-body">
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
      </dialog>
    );
  }
}
