import { Component, Element, h, Host, Prop } from "@stencil/core";
import { FOOTER_SKIP_TARGET_ID } from "./footer-skip-target";

// Light-DOM wrapper around cps-global-footer-content. Splitting the footer
// into a light-DOM shell + shadow-DOM partner lets us hand JAWS a focusable,
// named landmark it can announce on skip-link arrival (a custom element with a
// shadow root doesn't reliably announce its role/aria-label on focus — the
// shadow boundary opacifies the focus position, and JAWS falls back to a buffer
// line number). All the visible markup and style encapsulation still lives
// inside cps-global-footer-content's shadow root, so host-app CSS can't bleed in.
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

  // Set the skip-target id and tabindex on the host element if not already
  // present, so the "Skip to footer" link can resolve us by id (querySelector
  // does not pierce shadow roots — keeping the target in light DOM is the
  // whole point of the split) and programmatically focus us.
  //
  // Also pin display to block: light-DOM custom elements default to inline,
  // and footer-subscriber sets style.width / margin-left/right: auto — both
  // of which are no-ops on an inline element. Setting it once here in JS
  // rather than via a scoped stylesheet keeps this component CSS-free and
  // ensures it lands before any external width writes.
  componentDidLoad() {
    if (!this.el.id) {
      this.el.id = FOOTER_SKIP_TARGET_ID;
    }
    if (!this.el.hasAttribute("tabindex")) {
      this.el.tabIndex = -1;
    }
    if (!this.el.style.display) {
      this.el.style.display = "block";
    }
  }

  render() {
    // role+aria-label on the host turn this element into a proper landmark so
    // screen readers announce "Footer, content info" when the skip link moves
    // focus here, rather than e.g. "move to line 35". The inner partner
    // intentionally does NOT also declare a contentinfo landmark — we want a
    // single, focusable landmark, and it lives here on the light-DOM shell.
    return (
      <Host role="contentinfo" aria-label="Footer">
        <cps-global-footer-content userEmail={this.userEmail} />
      </Host>
    );
  }
}
