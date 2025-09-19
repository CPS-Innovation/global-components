import { FoundContext } from "../context/find-context";
import { DomMutationObserver } from "./DomMutationSubscriber";
import "arrive";

export const initialiseDomObservation = ({ window: { document } }: { window: Window }, ...subscribers: DomMutationObserver[]) => ({
  initialiseDomForContext: ({ context }: { context: FoundContext }) => {
    subscribers.forEach(subscriber => {
      const { isActiveForContext, subscriptions } = subscriber({ context });
      subscriptions.forEach(({ cssSelector, handler, unbind }) => {
        if (isActiveForContext) {
          document.arrive(cssSelector, handler);
        } else {
          document.unbindArrive(cssSelector);
          unbind?.();
        }
      });
    });
  },
});
