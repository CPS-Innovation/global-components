import { DomMutationObserver } from "../browser/dom/DomMutationObserver";
import { makeConsole } from "../../logging/makeConsole";

const REGION_CODE = "witness";
const TARGET_SELECTOR = "div#WitnessIsActive";
// cspell:disable-next-line
const URL_FRAGMENT = "/workmanagementapp/caseoverview";

const { _debug } = makeConsole("witnessAreaSubscriber");

// Inject a <cps-region> into div#WitnessIsActive once and walk away. The cps-region
// component handles its own presence lifecycle (mount + visibility), so the subscriber
// doesn't need to track display toggles or remove the region when hidden — the region
// itself goes inactive when its host is display:none, and back active when un-hidden.
export const createWitnessAreaSubscriber =
  (enabled: boolean): DomMutationObserver =>
  ({ context }) => {
    const isActiveForContext = enabled && !!context.currentHref?.toLowerCase().includes(URL_FRAGMENT);
    _debug("subscriber evaluated", { enabled, currentHref: context.currentHref, isActiveForContext });
    return {
      isActiveForContext,
      subscriptions: [
        {
          cssSelector: TARGET_SELECTOR,
          handler: (element: Element) => {
            const htmlEl = element as HTMLElement;
            if (htmlEl.querySelector(`cps-region[code="${REGION_CODE}"]`)) {
              _debug("cps-region already present — no-op");
              return;
            }
            htmlEl.insertAdjacentHTML("beforeend", `<cps-region code="${REGION_CODE}"></cps-region>`);
            _debug("WitnessIsActive matched — added cps-region", REGION_CODE);
          },
        },
      ],
    };
  };
