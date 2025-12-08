import { makeConsole } from "../../logging/makeConsole";
import { DomMutationObserver } from "../dom/DomMutationObserver";

const MATERIALS_LINK_LOCATOR = "#b2-Materials a";
const MATERIALS_CLICK_HANDOVER_MARKER = "#cps-global-components-navigate-materials";

const { _debug } = makeConsole("initialiseInterimDcfNavigation");

const triggerClickObserver: DomMutationObserver = () => ({
  isActiveForContext: true,
  subscriptions: [{ cssSelector: MATERIALS_LINK_LOCATOR, handler: el => (el as HTMLAnchorElement)?.click() }],
});

const nullObserver: DomMutationObserver = () => ({ isActiveForContext: false, subscriptions: [] });

export const initialiseInterimDcfNavigation = ({ window }: { window: Window }) => {
  // For DCF cases our menu emits an event for Details <--> Materials navigation. As a shim, we listen
  //  for this event and use it as an instruction to force a navigation.
  window.addEventListener("cps-global-header-event-private", (event: Event & { detail: string }) => {
    _debug("A navigation event has been fired: ", event);
    (document.querySelector(MATERIALS_LINK_LOCATOR) as HTMLAnchorElement)?.click();
  });

  // So that we can get to Materials from the outside e.g. Case Review app, we look for a marker in
  //  the handover URL. If that marker is found then we remove it and arrange for the Materials link
  //  to be clicked as soon as it appears.
  if (window.location.hash === MATERIALS_CLICK_HANDOVER_MARKER) {
    _debug("Materials handover marker has been detected", window.location.hash);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    return triggerClickObserver;
  }

  return nullObserver;
};
