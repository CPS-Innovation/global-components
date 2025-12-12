import { onNavigation } from "./navigation";

export const initialiseNavigationSubscription = ({ handler, handleError }: { handler: () => void; handleError: (err: Error) => any }) =>
  onNavigation(() => {
    try {
      handler();
    } catch (err) {
      handleError(err);
    }
  });
