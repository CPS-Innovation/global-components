import { Component, Element, h, Fragment } from "@stencil/core";
import { readyState } from "../../store/store";
import { WithLogging } from "../../logging/WithLogging";

// The synthesised "Skip to main content" target, used when a host does not configure a mainSelector.
//  CpsSkipLinks (the controller) owns its create/destroy lifecycle; the main cps-skip-link simply
//  targets it by id like any other conventional anchor target.
const FALLBACK_TARGET_ID = "cps-header-main-content";

// Renders between one and three skip links (main / case search / case list). Each link is shown
// only when its target is present: the main link always renders — synthesising a fallback target
// when no mainSelector is configured, otherwise rendering only once its configured selector is
// detected; search/list render only when their selector is configured AND detected in the DOM
// (presence is tracked in the store by skipLinkSubscriber).
//
// This is a component in its own right (rather than inline in the banner) so it owns its own
// readyState subscription: when skipLinkTargets flips, only the skip links re-render, not the
// whole banner. It is also the mediator that owns the synthesised fallback target's DOM lifecycle.
@Component({
  tag: "cps-skip-links",
  shadow: false,
})
export class CpsSkipLinks {
  @Element() el: HTMLElement;

  // Whether we are responsible for synthesising the fallback target. undefined until the context is
  //  known, so a not-ready render never tears down a target we created.
  private fallbackNeeded: boolean | undefined = undefined;
  private createdFallback = false;

  // Create/remove the fallback target in the light DOM, immediately after the host header (mirroring
  //  where the page's main content sits). Idempotent, and only ever removes a target we created.
  private syncFallbackTarget() {
    if (this.fallbackNeeded === undefined) {
      return;
    }

    const existing = document.getElementById(FALLBACK_TARGET_ID);
    if (this.fallbackNeeded && !existing) {
      const host = (this.el.getRootNode() as ShadowRoot).host;
      if (!host) {
        return;
      }
      const target = document.createElement("div");
      target.id = FALLBACK_TARGET_ID;
      target.tabIndex = -1;
      host.after(target);
      this.createdFallback = true;
    } else if (!this.fallbackNeeded && this.createdFallback) {
      existing?.remove();
      this.createdFallback = false;
    }
  }

  componentDidRender() {
    this.syncFallbackTarget();
  }

  disconnectedCallback() {
    if (this.createdFallback) {
      document.getElementById(FALLBACK_TARGET_ID)?.remove();
      this.createdFallback = false;
    }
  }

  @WithLogging("CpsSkipLinks")
  render() {
    const { isReady, state } = readyState(["context"], ["skipLinkTargets"]);
    if (!isReady) {
      this.fallbackNeeded = undefined;
      return <></>;
    }

    const skipLinks = state.context?.skipLinks;
    const targets = state.skipLinkTargets ?? { main: false, search: false, list: false };
    const useScroll = !!skipLinks?.useScroll;

    // No mainSelector → we synthesise a fallback target and the main link skips to it by id.
    const usingFallback = !skipLinks?.mainSelector;
    this.fallbackNeeded = usingFallback;
    const mainSelector = skipLinks?.mainSelector ?? `#${FALLBACK_TARGET_ID}`;

    // Main: with the synthesised fallback it always renders; with a configured selector only once
    //  detected. Search/list: render only when their selector is configured AND detected.
    const showMain = usingFallback || targets.main;
    const showSearch = !!skipLinks?.searchSelector && targets.search;
    const showList = !!skipLinks?.listSelector && targets.list;

    return (
      <Fragment>
        {showMain && (
          <cps-skip-link targetSelector={mainSelector} useScroll={useScroll}>
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
