import { Component, Element, h, Host, Prop } from "@stencil/core";
import { FOOTER_SKIP_TARGET_ID } from "./footer-skip-target";

// Light-DOM wrapper around cps-global-footer-content. The split exists so the
// skip-link target is queryable from outside any shadow root (querySelector
// does not pierce shadow boundaries) while the visible markup + styles still
// live inside the inner partner's shadow root for host-CSS isolation.
//
// The focus target is a plain <div> inside the wrapper, not the wrapper's
// host element. Iteration history is worth keeping because the obvious shapes
// all failed in distinct ways against JAWS:
//
//   - Focusing the wrapper host with no role/name: JAWS reported "line N"
//     alone — no nameable focus target.
//   - Focusing the wrapper host with role=contentinfo + aria-label: JAWS
//     drifted to the inner partner's "Footer links" h2 — a stronger anchor
//     than the wrapper's ARIA naming.
//   - Removing the inner h2 and focusing a visually-hidden h2 inside the
//     wrapper: announced "Footer, heading level 2" but appended "line N"
//     because a 1px clipped element has no visible footprint for JAWS to
//     anchor "where am I?" against.
//   - Focusing the wrapper host with role=contentinfo + aria-label and no
//     competing inner h2: JAWS *still* skipped past the wrapper's ARIA and
//     announced "move to line N, list" (reading the inner <ul>). ARIA on a
//     custom-element host is not reliably respected.
//
// Current shape: wrapper is structural only (display:block for width-sync).
// A plain <div> inside carries the focus target — JAWS handles role + aria-
// label on a vanilla HTML element without the custom-element-host caveats,
// and the visible footer content immediately below it provides the visual
// anchor that suppresses the line-N positional fallback.
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
    return (
      <Host>
        <div role="contentinfo" aria-label="Footer" tabindex={-1} id={FOOTER_SKIP_TARGET_ID}>
          <cps-global-footer-content userEmail={this.userEmail} />
        </div>
      </Host>
    );
  }
}
