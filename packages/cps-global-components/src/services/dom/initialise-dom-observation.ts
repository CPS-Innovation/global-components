import { _console } from "../../logging/_console";
import { FoundContext } from "../context/FoundContext";
import { DomMutationObserver } from "./DomMutationSubscriber";
import "arrive";

export const initialiseDomObservation = ({ window: { document } }: { window: Window }, ...subscribers: DomMutationObserver[]) => ({
  initialiseDomForContext: ({ context }: { context: FoundContext }) => {
    subscribers.forEach(subscriber => {
      const { isActiveForContext, subscriptions } = subscriber({ context });
      subscriptions.forEach(({ cssSelector, handler, unbind }) => {
        if (isActiveForContext) {
          _console.debug("Dom observation", `Activating for ${cssSelector}`);
          // Look for any pre-existing elements that match our criteria...
          document.querySelectorAll(cssSelector).forEach(element => handler(element));
          // ... then set up our mutation observation
          document.arrive(cssSelector, handler);
          _console.debug("Dom observation", `Activated for ${cssSelector}`);
        } else {
          document.unbindArrive(cssSelector);
          unbind?.();
          _console.debug("Dom observation", `Deactivated for ${cssSelector}`);
        }
      });
    });
  },
});
