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
      const target = document.getElementById(TARGET_ID);
      if (!target) return;

      _debug("Scrolling to", `#${TARGET_ID}`);
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

    const jsHandlers = this.isOutSystems ? { onClick: navigateToAnchor, onKeyDown: handleKeyDown } : {};

    return (
      <a href={`#${TARGET_ID}`} class="govuk-skip-link skip-link" data-module="govuk-skip-link" {...jsHandlers}>
        <slot />
      </a>
    );
  }
}
