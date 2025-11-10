import { _console } from "../../logging/_console";
import { SubscriptionFactory } from "./SubscriptionFactory";

export const loggingSubscriptionFactory: SubscriptionFactory = () => ({
  subscription: {
    set: (key, newValue) => {
      _console.debug("Store", `Setting ${key}`, newValue);
    },
    // get: key => {
    //   _console.debug("Store", `Getting ${key}`);
    // },
  },
});
