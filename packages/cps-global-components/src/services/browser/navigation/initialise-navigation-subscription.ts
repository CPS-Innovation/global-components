import { onNavigation } from "./navigation";

export const initialiseNavigationSubscription = ({ window, handler, handleError }: { window?: Window & typeof globalThis; handler: () => void; handleError: (err: Error) => any }) =>
  onNavigation(() => {
    try {
      handler();
    } catch (err) {
      handleError(err);
    }
  }, window);
