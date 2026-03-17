import { DomMutationObserver } from "./DomMutationObserver";
import { dispatchHostAppEvent } from "../../analytics/host-app-event";
import { makeConsole } from "../../../logging/makeConsole";

const { _debug } = makeConsole("hostAppEventSubscriber");

export const hostAppEventSubscriber: DomMutationObserver = ({ context }) => ({
  isActiveForContext: !!context.hostAppEventTargets?.length,
  subscriptions: (context.hostAppEventTargets || []).map(cssSelector => ({
    cssSelector,
    handler: (element: Element) => {
      _debug("Attaching click listener to", cssSelector);
      element.addEventListener(
        "click",
        () => {
          _debug("Host app event fired for", cssSelector);
          dispatchHostAppEvent({
            action: "click",
            elementId: cssSelector,
            contextIds: context.contextIds || "",
          });
        },
        { passive: true, once: true },
      );
      return true;
    },
  })),
});
