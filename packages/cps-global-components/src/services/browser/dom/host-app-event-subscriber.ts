import { DomMutationObserver } from "./DomMutationObserver";
import { dispatchHostAppEvent } from "../../analytics/host-app-event";
import { makeConsole } from "../../../logging/makeConsole";

const { _debug } = makeConsole("hostAppEventSubscriber");

export const hostAppEventSubscriber: DomMutationObserver = ({ context }) => ({
  isActiveForContext: !!context.hostAppEventTargets?.length,
  subscriptions: (context.hostAppEventTargets || []).map(target => {
    let fired = false;

    return {
      cssSelector: target.selector,
      handler: (element: Element) => {
        if (fired) return true;
        fired = true;

        const dispatch = () =>
          dispatchHostAppEvent({
            action: target.action,
            elementId: target.selector,
            contextIds: context.contextIds || "",
          });

        if (target.action === "appear") {
          _debug("Element appeared", target.selector);
          dispatch();
        } else {
          _debug("Attaching click listener to", target.selector);
          element.addEventListener(
            "click",
            () => {
              _debug("Host app event fired for", target.selector);
              dispatch();
            },
            { passive: true, once: true },
          );
        }

        return true;
      },
    };
  }),
});
