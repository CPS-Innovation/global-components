import { RegionEnterEvent, RegionLeaveEvent } from "./region-events";

export const regionRegistry = {
  enter: (_el: HTMLElement, code: string, subjectId?: string) => {
    document.dispatchEvent(new RegionEnterEvent({ code, subjectId }));
  },
  leave: (_el: HTMLElement, code: string, subjectId?: string) => {
    document.dispatchEvent(new RegionLeaveEvent({ code, subjectId }));
  },
};
