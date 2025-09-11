import { _console } from "../../logging/_console";
import { SubscriptionFactory } from "../store";

export const resetPreventionSubscription: SubscriptionFactory = () => ({
  reset: () => {
    throw new Error("We do not support resetting state - the initiation of state is done only in the startup of the app");
  },
});
