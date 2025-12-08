import { makeConsole } from "../../logging/makeConsole";

const { _debug } = makeConsole("initialiseInterimDcfNavigation");

export const initialiseInterimDcfNavigation = ({ window }: { window: Window }) => {
  window.addEventListener("cps-global-header-event", (event: Event & { detail: string }) => {
    _debug("A navigation event has been fired: ", event);
    const link = document.querySelector("#b2-Materials a") as HTMLAnchorElement;
    link?.click();
  });
};
