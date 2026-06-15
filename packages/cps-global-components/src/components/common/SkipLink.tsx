import { Component, Element, h, Prop } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("SkipLink");

const TARGET_ID = "cps-header-main-content";

@Component({
  tag: "cps-skip-link",
  shadow: false,
})
export class SkipLink {
  @Element() el: HTMLElement;

  // Raw CSS selector (class or id) for the target to skip to.
  @Prop() targetSelector?: string;
  // Only the main link with no configured selector creates/owns the #cps-header-main-content div.
  @Prop() createFallbackTarget: boolean = false;
  // Force JS scrollIntoView+focus handlers instead of native anchor navigation.
  @Prop() useScroll: boolean = false;

  private createdTarget = false;

  componentDidLoad() {
    if (!this.createFallbackTarget) return;
    if (document.getElementById(TARGET_ID)) return;

    const host = (this.el.getRootNode() as ShadowRoot).host;
    if (!host) return;

    const target = document.createElement("div");
    target.id = TARGET_ID;
    target.tabIndex = -1;
    host.insertAdjacentElement("afterend", target);
    this.createdTarget = true;
  }

  disconnectedCallback() {
    if (!this.createdTarget) return;
    document.getElementById(TARGET_ID)?.remove();
    this.createdTarget = false;
  }

  // #FCT2-11717 - some host apps (e.g. OutSystems) do not allow the usual <a href="#some-id"> skip to
  //  work as (I think) they listen for history pushState events and do other conflicting page load
  //  stuff on those events. Such contexts opt into the JS scroll approach via `useScroll` in config.
  render() {
    const resolveTarget = (): HTMLElement | null => {
      if (this.targetSelector) {
        const found = document.querySelector(this.targetSelector);
        if (found instanceof HTMLElement) {
          if (found.tabIndex < 0 && !found.hasAttribute("tabindex")) {
            found.tabIndex = -1;
          }
          return found;
        }
      }
      return this.createFallbackTarget ? document.getElementById(TARGET_ID) : null;
    };

    const navigateToAnchor = (e: Event) => {
      e.preventDefault(); // CRITICAL: Prevents hash change

      const anchor = e.currentTarget as HTMLAnchorElement;
      const target = resolveTarget();
      if (!target) return;

      _debug("Scrolling to", target);
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
    const useJsHandlers = this.useScroll;
    const jsHandlers = useJsHandlers ? { onClick: navigateToAnchor, onKeyDown: handleKeyDown } : {};

    // Native anchor nav can only jump to an id. Use an id-shaped selector directly; otherwise
    //  fall back to the main target id.
    const idSelector = this.targetSelector && /^#[A-Za-z][\w-]*$/.test(this.targetSelector) ? this.targetSelector : undefined;
    const href = idSelector ?? `#${TARGET_ID}`;

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
