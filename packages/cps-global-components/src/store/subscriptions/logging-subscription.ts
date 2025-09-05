import { SubscriptionFactory } from "../store";

export const loggingSubscription: SubscriptionFactory = () => ({
  reset: () => {
    throw new Error("We do not support resetting state - the initiation of state is done only in the startup of the app");
  },
});
