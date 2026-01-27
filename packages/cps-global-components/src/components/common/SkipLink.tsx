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

  @Prop() isOutSystems: boolean = false;

  componentDidLoad() {
    if (document.getElementById(TARGET_ID)) return;

    const host = (this.el.getRootNode() as ShadowRoot).host;
    if (!host) return;

    const target = document.createElement("div");
    target.id = TARGET_ID;
    target.tabIndex = -1;
    host.insertAdjacentElement("afterend", target);
  }

  disconnectedCallback() {
    document.getElementById(TARGET_ID)?.remove();
  }

  // #FCT2-11717 - OS does not allow the usual <a href="#some-id"> skip to work as (I think) it listens for
  //  history pushState events and does other conflicting page load stuff on those events.
  render() {
    const navigateToAnchor = (e: Event) => {
      e.preventDefault(); // CRITICAL: Prevents hash change

      const anchor = e.currentTarget as HTMLAnchorElement;
      const target = document.querySelector(`#${TARGET_ID}`) as HTMLElement;
      if (target) {
        _debug("Scrolling in to view to ", `#${TARGET_ID}`);
        const scrollToTarget = () => {
          // Re-fetch in case Stencil replaced the DOM node between event and rAF
          const freshTarget = document.getElementById(TARGET_ID);
          _debug("Target fresh===captured", freshTarget === target, "isConnected", target.isConnected, freshTarget?.isConnected);

          const el = freshTarget || target;
          const rect = el.getBoundingClientRect();
          _debug("Before scroll", { scrollY: window.scrollY, targetTop: rect.top, offsetTop: el.offsetTop, parentElement: el.parentElement?.tagName });
          el.scrollIntoView({ behavior: "instant" });
          _debug("After scrollIntoView", { scrollY: window.scrollY, targetTop: el.getBoundingClientRect().top });
          el.focus();
          _debug("After focus", { scrollY: window.scrollY, targetTop: el.getBoundingClientRect().top });
          anchor.blur();

          // Track whether OS resets scroll position after us
          setTimeout(() => _debug("After 100ms", { scrollY: window.scrollY, targetTop: el.getBoundingClientRect().top }), 100);
          setTimeout(() => _debug("After 300ms", { scrollY: window.scrollY, targetTop: el.getBoundingClientRect().top }), 300);
          setTimeout(() => _debug("After 1000ms", { scrollY: window.scrollY, targetTop: el.getBoundingClientRect().top }), 1000);
        };

        // Double-rAF: wait two paint frames so OS's own pushState/navigation listeners
        //  have settled before we scroll, otherwise OS undoes our scroll.
        requestAnimationFrame(() => requestAnimationFrame(scrollToTarget));
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        navigateToAnchor(e);
      }
    };

    const jsHandlers = this.isOutSystems ? { onClick: navigateToAnchor, onKeyDown: handleKeyDown } : {};

    return (
      <a href={`#${TARGET_ID}`} class="govuk-skip-link skip-link" data-module="govuk-skip-link" {...jsHandlers}>
        <slot />
      </a>
    );
  }
}
