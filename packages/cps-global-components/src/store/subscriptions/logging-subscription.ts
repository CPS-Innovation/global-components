import { _console } from "../../logging/_console";
import { SubscriptionFactory } from "../store";

export const loggingSubscription: SubscriptionFactory = ({ store }) => ({
  set: (key, newValue) => {
    _console.debug("Store", `Setting ${key}`, newValue, JSON.stringify(store));
  },
});
