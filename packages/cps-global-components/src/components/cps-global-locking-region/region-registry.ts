import { RegionEnterEvent, RegionLeaveEvent } from "./region-events";

export const regionRegistry = {
  enter: (_el: HTMLElement, code: string) => {
    document.dispatchEvent(new RegionEnterEvent({ code }));
  },
  leave: (_el: HTMLElement, code: string) => {
    document.dispatchEvent(new RegionLeaveEvent({ code }));
  },
};
