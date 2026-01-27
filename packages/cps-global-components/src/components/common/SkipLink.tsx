import { FunctionalComponent, h } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("InertLink");

const TARGET_SELECTOR = "#cps-header-main-content";

type SkipLinkProps = h.JSX.IntrinsicElements["a"] & { isOutSystems?: boolean };

// #FCT2-11717 - OS does not allow the usual <a href="#some-id"> skip to work as (I think) it listens for
//  history pushState events and does other conflicting page load stuff on those events.
export const SkipLink: FunctionalComponent<SkipLinkProps> = ({ isOutSystems, ...anchorProps }, children) => {
  const navigateToAnchor = (e: Event) => {
    e.preventDefault(); // CRITICAL: Prevents hash change

    const target = document.querySelector(TARGET_SELECTOR) as HTMLElement;
    if (target) {
      _debug("Scrolling in to view to ", TARGET_SELECTOR);
      target.scrollIntoView({ behavior: "instant" });
      target.focus();
      // Important to lose focus so GDS css hides the yellow bar
      (e.currentTarget as HTMLAnchorElement).blur();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      navigateToAnchor(e);
    }
  };

  const jsHandlers = isOutSystems ? { onClick: navigateToAnchor, onKeyDown: handleKeyDown } : {};

  return (
    <a {...anchorProps} {...jsHandlers}>
      {children}
    </a>
  );
};
