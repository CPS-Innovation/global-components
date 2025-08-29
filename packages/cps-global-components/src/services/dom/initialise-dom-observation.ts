import { FoundContext } from "../context/find-context";
import { Register } from "../../store/store";
import { setupMutationObserver } from "./mutations";

type Props = { window: Window; registerToStore: Register };

const cache: { observer?: ReturnType<typeof setupMutationObserver>; contextIndex?: number } = {};

export const initialiseDomObservation = ({ window, registerToStore }: Props) => {
  const resetDomObservation = ({ context: { domTags, contextIndex } }: { context: FoundContext }) => {
    if (contextIndex != undefined && contextIndex === cache.contextIndex) {
      // Our address has changed but we are still in the same context. We should already be set up with an observer.
      return;
    }

    // At this point, whatever has been setup prior is defunct and needs to be cleared
    cache.observer?.disconnect();
    cache.contextIndex = undefined;
    registerToStore({ tags: {} });

    if (!domTags?.length) {
      // Our address has changed and the context does not require examining the dom
      return;
    }

    cache.contextIndex = contextIndex;
    cache.observer = setupMutationObserver(window.document.body, domTags, tags => registerToStore({ tags }));
  };
  return resetDomObservation;
};
