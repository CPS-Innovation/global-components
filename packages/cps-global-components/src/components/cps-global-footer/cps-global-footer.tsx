import { Component, Element, h, Host, Prop } from "@stencil/core";
import { FOOTER_SKIP_TARGET_ID } from "./footer-skip-target";

// Light-DOM wrapper around cps-global-footer-content. Splitting the footer
// into a light-DOM shell + shadow-DOM partner lets us hand JAWS a focusable,
// named element it can announce on skip-link arrival. The visible markup and
// style encapsulation still live inside cps-global-footer-content's shadow
// root, so host-app CSS can't bleed in.
//
// The focus target itself is a visually-hidden <h2> inside the wrapper, not
// the host element. Reasons:
//   - JAWS announces headings extremely reliably (role + name + level), where
//     a focusable custom-element host with role=contentinfo + aria-label often
//     gets overlooked: AT support for ARIA on undefined-element hosts is
//     inconsistent, and a heading inside the landmark is a stronger signal
//     than a label on it. Without the heading focus target, JAWS reached for
//     the next strongest name in scope — the inner partner's "Footer links"
//     h2 — and announced that instead of moving to the footer.
//   - querySelector doesn't pierce shadow roots, so a heading inside the
//     inner partner is unreachable from cps-skip-link. Keeping the heading
//     in the wrapper's light DOM is what makes the skip target queryable.
//
// Host apps continue to consume `<cps-global-footer>` as before — the inner
// partner is a private implementation detail.
@Component({
  tag: "cps-global-footer",
  shadow: false,
})
export class CpsGlobalFooter {
  @Element() el: HTMLElement;

  // Forwarded straight through to cps-global-footer-content.
  @Prop() userEmail?: string;

  // Light-DOM custom elements default to inline, which silently disables
  // footer-subscriber's style.width and `margin: auto` writes. Pin to block
  // once, here, so external width sync actually applies. Guarded so a host
  // page's own inline display wins.
  componentDidLoad() {
    if (!this.el.style.display) {
      this.el.style.display = "block";
    }
  }

  render() {
    // role=contentinfo + aria-label name the landmark for D-key landmark nav.
    // The same label appears as the h2 text below; either could change first
    // without breaking the other.
    //
    // Visually-hidden styles are inlined rather than relying on the GDS
    // `govuk-visually-hidden` class: this h2 lives in the wrapper's light DOM
    // (so cps-skip-link can find it via querySelector), and we cannot assume
    // the host page has loaded govuk-frontend at document scope. Without the
    // rule the h2 would render as a visible "Footer" heading above the
    // content. The rule below is the standard WCAG visually-hidden recipe.
    return (
      <Host role="contentinfo" aria-label="Footer">
        <h2
          id={FOOTER_SKIP_TARGET_ID}
          tabindex={-1}
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            margin: "0",
            padding: "0",
            overflow: "hidden",
            clip: "rect(0 0 0 0)",
            whiteSpace: "nowrap",
            border: "0",
          }}
        >
          Footer
        </h2>
        <cps-global-footer-content userEmail={this.userEmail} />
      </Host>
    );
  }
}
