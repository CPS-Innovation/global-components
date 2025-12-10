import { makeConsole } from "../../../logging/makeConsole";

const { _debug } = makeConsole("global-script");

export const initialiseNavigationSubscription = ({ window, handler, handleError }: { window: Window; handler: () => void; handleError: (err: Error) => any }) =>
  window.navigation?.addEventListener("navigatesuccess", async event => {
    _debug("navigation", event);
    try {
      handler();
    } catch (err) {
      handleError(err);
    }
  });
