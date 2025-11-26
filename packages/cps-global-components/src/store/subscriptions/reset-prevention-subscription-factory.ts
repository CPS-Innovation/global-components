import { SubscriptionFactory } from "./SubscriptionFactory";

export const resetPreventionSubscriptionFactory: SubscriptionFactory = () => ({
  type: "subscription",
  handler: {
    reset: () => {
      throw new Error("We do not support resetting state - the initiation of state is done only in the startup of the app");
    },
  },
});
