import { DomMutationObserver } from "../browser/dom/DomMutationObserver";
import { makeConsole } from "../../logging/makeConsole";

const REGION_CODE = "witness";
const TARGET_SELECTOR = "div#WitnessIsActive";
// cspell:disable-next-line
const URL_FRAGMENT = "/workmanagementapp/caseoverview";

const { _debug } = makeConsole("witnessAreaSubscriber");

export const createWitnessAreaSubscriber =
  (enabled: boolean): DomMutationObserver =>
  ({ context, window }) => {
    const isActiveForContext = enabled && !!context.currentHref?.toLowerCase().includes(URL_FRAGMENT);
    _debug("subscriber evaluated", { enabled, currentHref: context.currentHref, isActiveForContext });
    return {
      isActiveForContext,
      subscriptions: [
        {
          cssSelector: TARGET_SELECTOR,
          handler: (element: Element) => {
            const htmlEl = element as HTMLElement;
            const isVisible = htmlEl.style.display !== "none";
            const existing = htmlEl.querySelector(`cps-region[code="${REGION_CODE}"]`);
            _debug("handler firing", { isVisible, hasExisting: !!existing, inlineDisplay: htmlEl.style.display });

            if (isVisible && !existing) {
              const region = window.document.createElement("cps-region");
              region.setAttribute("code", REGION_CODE);
              htmlEl.appendChild(region);
              _debug("WitnessIsActive visible — added cps-region", REGION_CODE);
            } else if (!isVisible && existing) {
              existing.remove();
              _debug("WitnessIsActive hidden — removed cps-region", REGION_CODE);
            }
          },
        },
      ],
    };
  };
