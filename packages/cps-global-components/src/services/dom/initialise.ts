import { FoundContext } from "../context/find-context";
import { DomMutationObserver } from "./DomMutationSubscriber";

export const initialise = ({ window: { document } }: { window: Window }, ...subscribers: DomMutationObserver[]) => ({
  initialiseDomForContext: ({ context }: { context: FoundContext }) => {
    subscribers.forEach(subscriber => {
      const { isActiveForContext, subscriptions } = subscriber({ context });
      subscriptions.forEach(({ cssSelector, handler }) => {
        if (isActiveForContext) {
          document.arrive(cssSelector, handler);
        } else {
          document.unbindArrive(cssSelector);
        }
      });
    });
  },
});
