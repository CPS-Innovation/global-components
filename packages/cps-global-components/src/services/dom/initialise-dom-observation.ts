import { _console } from "../../logging/_console";
import { MergeTags, Register } from "../../store/store";
import { FoundContext } from "../context/FoundContext";
import { DomMutationObserver } from "./DomMutationSubscriber";
import "arrive";

type Subscription = ReturnType<DomMutationObserver>["subscriptions"][number];

export const initialiseDomObservation = (
  { window: { document }, register, mergeTags }: { window: Window; register: Register; mergeTags: MergeTags },
  ...subscribers: DomMutationObserver[]
) => ({
  initialiseDomForContext: ({ context }: { context: FoundContext }) => {
    let activeSubscriptions: Subscription[] = [];

    const log = (msg: string) => {
      _console.debug("Dom observation", msg);
      _console.debug("Dom observation", `There are ${activeSubscriptions.length} active DOM handlers: ${activeSubscriptions.map(h => h.cssSelector).join(", ")}.`);
    };

    const bindHandler = (subscription: Subscription) => {
      const { cssSelector, handler } = subscription;
      log(`Activating for ${cssSelector}`);
      document.arrive(cssSelector, { fireOnAttributesModification: true, existing: true }, el => {
        const shouldUnBind = handler(el);
        if (shouldUnBind) {
          unBindHandler(subscription);
        }
      });
      activeSubscriptions = [...activeSubscriptions, subscription];
      log(`Activated for ${cssSelector}`);
    };

    const unBindHandler = (subscription: Subscription) => {
      const { cssSelector, handler } = subscription;
      log(`Deactivating for ${cssSelector}`);
      document.unbindArrive(handler);
      const subscriptionCount = activeSubscriptions.length;
      activeSubscriptions = activeSubscriptions.filter(s => s !== subscription);
      const wasDisposed = activeSubscriptions.length < subscriptionCount;
      log(wasDisposed ? `Deactivated for ${cssSelector}.` : `${cssSelector} was not active.`);
    };

    subscribers.forEach(subscriber => {
      const { isActiveForContext, subscriptions } = subscriber({ context, register, mergeTags, window });
      subscriptions.forEach(subscription => (isActiveForContext ? bindHandler(subscription) : unBindHandler(subscription)));
    });
    log("Subscriptions set up.");
  },
});
