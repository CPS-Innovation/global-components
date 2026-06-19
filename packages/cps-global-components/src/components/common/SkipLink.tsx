import { Component, h, Prop } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("SkipLink");

// A presentational skip link to a single target. It owns no DOM beyond its own anchor — the
//  target (including any synthesised fallback) is the concern of the controlling cps-skip-links.
@Component({
  tag: "cps-skip-link",
  shadow: false,
})
export class SkipLink {
  // Raw CSS selector (class or id) for the target to skip to.
  @Prop() targetSelector?: string;
  // Force JS scrollIntoView+focus handlers instead of native anchor navigation.
  @Prop() useScroll: boolean = false;

  render() {
    const resolveTarget = (): HTMLElement | null => {
      if (!this.targetSelector) {
        return null;
      }
      const found = document.querySelector(this.targetSelector);
      if (found instanceof HTMLElement) {
        if (found.tabIndex < 0 && !found.hasAttribute("tabindex")) {
          found.tabIndex = -1;
        }
        return found;
      }
      return null;
    };

    const navigateToAnchor = (e: Event) => {
      e.preventDefault(); // CRITICAL: Prevents hash change

      const anchor = e.currentTarget as HTMLAnchorElement;
      const target = resolveTarget();
      if (!target) {
        return;
      }

      _debug("Scrolling to", target);
      anchor.blur(); // remove the yellow box FIRST so layout settles
      target.scrollIntoView({ behavior: "instant" });
      target.focus({ preventScroll: true });
      // Important to lose focus so GDS css hides the yellow bar
      anchor.blur();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        navigateToAnchor(e);
      }
    };

    // JS-ness is controlled purely by useScroll, NOT by the presence of a target selector.
    // #FCT2-11717 - some host apps (e.g. OutSystems) do not allow the usual <a href="#some-id"> skip
    //  to work as (I think) they listen for history pushState events and do other conflicting page
    //  load stuff on those events. Such contexts opt into this JS scroll approach via `useScroll`.
    const useJsHandlers = this.useScroll;
    const jsHandlers = useJsHandlers ? { onClick: navigateToAnchor, onKeyDown: handleKeyDown } : {};

    // Native anchor nav can only jump to an id. Use an id-shaped selector directly; otherwise the
    //  href is cosmetic (JS handles navigation and preventDefault's the click).
    const idSelector = this.targetSelector && /^#[A-Za-z][\w-]*$/.test(this.targetSelector) ? this.targetSelector : undefined;
    const href = idSelector ?? "#";

    // A class-based (non-id) target with native nav is a misconfiguration: native anchors can't
    //  reach a class, and the host element won't get the tabindex=-1 the JS path applies.
    if (!useJsHandlers && this.targetSelector && !idSelector) {
      _debug("Class-based target selector", this.targetSelector, "requires useScroll: native anchor nav can only reach an id");
    }

    return (
      <a href={href} class="govuk-skip-link skip-link" data-module="govuk-skip-link" {...jsHandlers}>
        <slot />
      </a>
    );
  }
}
