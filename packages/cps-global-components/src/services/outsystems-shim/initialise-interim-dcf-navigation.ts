import { makeConsole } from "../../logging/makeConsole";
import { DomMutationObserver } from "../browser/dom/DomMutationObserver";

const MATERIALS_HANDOVER_MARKER = "#cps-global-components-navigate-materials";
// An arbitrary locator, when found it means the page is loaded enough for us
//  to trigger our navigation event and for it to be picked up usefully.
const READY_TO_NAVIGATE_LOCATOR = "main";
const NAVIGATE_EVENT_NAME = "cps-global-header-event";
// THis has to match the dcfContextsToUseEventNavigation.data value in the config file
const NAVIGATE_EVENT_DATA = "materials";

const { _debug } = makeConsole("initialiseInterimDcfNavigation");

export const initialiseInterimDcfNavigation = ({ window }: { window: Window }): DomMutationObserver => {
  // So that we can get to Materials from the outside e.g. Case Review app, we look for a marker in
  //  the handover URL. If that marker is found then we remove it and arrange for the Materials link
  //  to be clicked as soon as it appears.
  if (window.location.hash === MATERIALS_HANDOVER_MARKER) {
    _debug("Materials handover marker has been detected", window.location.hash);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return () => ({
      isActiveForContext: true,
      subscriptions: [
        {
          cssSelector: READY_TO_NAVIGATE_LOCATOR,
          handler: () =>
            window.dispatchEvent(
              new CustomEvent(NAVIGATE_EVENT_NAME, {
                detail: NAVIGATE_EVENT_DATA,
              }),
            ),
        },
      ],
    });
  } else {
    // Return a noop object
    return () => ({ isActiveForContext: false, subscriptions: [] });
  }
};
