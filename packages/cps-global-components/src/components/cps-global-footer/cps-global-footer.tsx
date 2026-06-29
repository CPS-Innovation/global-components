import { Component, Element, h, Host, Prop } from "@stencil/core";
import { FOOTER_SKIP_TARGET_ID } from "./footer-skip-target";

// Light-DOM wrapper around cps-global-footer-content. The split exists so the
// skip-link target is queryable from outside any shadow root (querySelector
// does not pierce shadow boundaries) while the visible markup + styles still
// live inside the inner partner's shadow root for host-CSS isolation.
//
// The wrapper itself is the focus target — not a hidden heading inside it.
// History on this is worth keeping because the obvious fix tried previously
// did not survive contact with JAWS:
//
//   - Focusing the wrapper without a role/name made JAWS report "line N"
//     alone because there was no nameable focus target.
//   - Focusing the wrapper with role=contentinfo + aria-label drifted to the
//     inner partner's "Footer links" h2, because the partner's heading was a
//     stronger anchor than the wrapper's ARIA naming.
//   - Focusing a visually-hidden h2 inside the wrapper announced "Footer,
//     heading level 2" correctly — but JAWS appended "line N" as a position
//     fallback because a clipped 1px element has no visible footprint for
//     JAWS to anchor "where am I?" against. Users whose JAWS verbosity has
//     line-numbers off-by-default still hear it in this configuration.
//
// The current shape: wrapper is the focus target, role=contentinfo + aria-label
// name the landmark, and the inner partner's content (no longer competing
// with a redundant inner heading) gives JAWS a visible anchor — so the line-N
// fallback no longer fires.
@Component({
  tag: "cps-global-footer",
  shadow: false,
})
export class CpsGlobalFooter {
  @Element() el: HTMLElement;

  // Forwarded straight through to cps-global-footer-content.
  @Prop() userEmail?: string;

  // Pin id + tabindex on the host element so the "Skip to footer" link can
  // resolve us by id and programmatically focus us. Each guard lets a host
  // page override (a host-supplied id wins; an explicit display wins). Light-
  // DOM custom elements default to inline — block is required for
  // footer-subscriber's width / margin auto writes to apply.
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
    return (
      <Host role="contentinfo" aria-label="Footer">
        <cps-global-footer-content userEmail={this.userEmail} />
      </Host>
    );
  }
}
