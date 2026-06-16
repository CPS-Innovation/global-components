import { TrackEvent } from "../analytics/analytics-event";
import { makeConsole } from "../../logging/makeConsole";
import "arrive";

const { _debug } = makeConsole("dark-reader-detection");

const hasDarkReaderAttribute = (element: Element) => element.getAttributeNames().some(name => name.toLowerCase().includes("darkreader"));

export const initialiseDarkReaderDetection = ({ window: { document }, trackEvent }: { window: { document: Document }; trackEvent: TrackEvent }) => {
  const handler = (element: Element) => {
    if (!hasDarkReaderAttribute(element)) {
      return;
    }
    document.unbindArrive(handler);
    _debug("Dark Reader detected on <html>");
    trackEvent({ name: "dark-reader-detected" });
  };
  document.arrive("html", { existing: true, fireOnAttributesModification: true }, handler);
};
