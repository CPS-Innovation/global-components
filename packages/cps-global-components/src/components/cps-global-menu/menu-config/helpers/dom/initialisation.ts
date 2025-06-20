import { Config } from "cps-global-configuration";
import { findContext } from "../context/find-context";
import { setupMutationObserver } from "./mutations";
import { resetDomTags } from "./tags";

const cache: { observer?: ReturnType<typeof setupMutationObserver>; contextIndex?: number } = {};

export const initialiseDomObservation = ({ CONTEXTS }: Config, window: Window, callback: () => void) => {
  const resetDomObservation = () => {
    const { domTags, contextIndex } = findContext(CONTEXTS, window);

    if (contextIndex != undefined && contextIndex === cache.contextIndex) {
      // Our address has changed but we are still in the same context. We should already be set up with an observer.
      return;
    }

    // At this point, whatever has been setup prior is defunct and needs to be cleared
    cache.observer?.disconnect();
    cache.contextIndex = undefined;
    resetDomTags();

    if (!domTags?.length) {
      // Our address has changed and the context does not require examining the dom
      return;
    }

    cache.contextIndex = contextIndex;
    cache.observer = setupMutationObserver(window.document.body, domTags, callback);
  };

  // We detect when the address changes so we can reassess whether we need to scan the DOM...
  window.navigation.addEventListener("navigate", resetDomObservation);

  // ... and then also execute our logic immediately on the DOM as it is
  resetDomObservation();
};
