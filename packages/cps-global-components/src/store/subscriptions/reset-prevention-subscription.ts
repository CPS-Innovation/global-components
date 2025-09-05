import { _console } from "../../logging/_console";
import { SubscriptionFactory } from "../store";

export const resetPreventionSubscription: SubscriptionFactory = () => ({
  set: (key, newValue) => {
    _console.debug("Store", `Setting ${key}`, newValue?.toString());
  },
});
