import { FunctionalComponent, h } from "@stencil/core";
import { makeConsole } from "../../logging/makeConsole";
import { FoundContext } from "../../services/context/FoundContext";

const { _debug } = makeConsole("InertLink");

type InertLinkProps = h.JSX.IntrinsicElements["a"] & Pick<FoundContext, "skipToMainContentCustomSelector">;

// #FCT2-11717 - OS does not allow the usual <a href="#some-id"> skip to work as (I think) it listens for
//  history pushState events and does other conflicting page load stuff on those events.
export const SkipLink: FunctionalComponent<InertLinkProps> = ({ skipToMainContentCustomSelector, ...anchorProps }, children) => {
  const navigateToAnchor = (e: Event) => {
    e.preventDefault(); // CRITICAL: Prevents hash change

    const target = document.querySelector(skipToMainContentCustomSelector!) as HTMLElement;
    if (target) {
      _debug("Scrolling in to view to ", skipToMainContentCustomSelector);
      target.scrollIntoView({ behavior: "instant" });
      target.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      navigateToAnchor(e);
    }
  };

  const props = { ...anchorProps, ...(skipToMainContentCustomSelector ? { onclick: navigateToAnchor, onkeydown: handleKeyDown } : undefined) };

  return <a {...props}>{children}</a>;
};
