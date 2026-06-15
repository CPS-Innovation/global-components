import { Component, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";

// Renders between one and three skip links (main / case search / case list). Each link is
// shown only when its target is present: the main link always renders (falling back to a
// created #cps-header-main-content div) unless a mainSelector is configured, in which case it
// renders only once detected; search/list render only when their selector is configured AND
// detected in the DOM (presence is tracked in the store by skipLinkSubscriber).
//
// This is a component in its own right (rather than inline in the banner) so it owns its own
// readyState subscription: when skipLinkTargets flips, only the skip links re-render, not the
// whole banner.
@Component({
  tag: "cps-skip-links",
  shadow: false,
})
export class SkipLinks {
  @WithLogging("CpsSkipLinks")
  render() {
    const { isReady, state } = readyState(["context"], ["skipLinkTargets"]);
    if (!isReady) {
      return <></>;
    }

    const skipLinks = state.context?.skipLinks;
    const targets = state.skipLinkTargets ?? { main: false, search: false, list: false };
    const useScroll = !!skipLinks?.useScroll;

    // Main: when no selector is configured, always render and create the fallback target.
    //  When a selector is configured, render only once detected. Search/list: render only
    //  when their selector is configured AND detected.
    const showMain = !skipLinks?.mainSelector || targets.main;
    const showSearch = !!skipLinks?.searchSelector && targets.search;
    const showList = !!skipLinks?.listSelector && targets.list;

    return (
      <Fragment>
        {showMain && (
          <cps-skip-link targetSelector={skipLinks?.mainSelector} createFallbackTarget={!skipLinks?.mainSelector} useScroll={useScroll}>
            Skip to main content
          </cps-skip-link>
        )}
        {showSearch && (
          <cps-skip-link targetSelector={skipLinks?.searchSelector} useScroll={useScroll}>
            Skip to case search
          </cps-skip-link>
        )}
        {showList && (
          <cps-skip-link targetSelector={skipLinks?.listSelector} useScroll={useScroll}>
            Skip to case list
          </cps-skip-link>
        )}
      </Fragment>
    );
  }
}
