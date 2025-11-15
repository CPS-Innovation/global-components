import { makeConsole } from "../../logging/makeConsole";
import { SubscriptionFactory } from "./SubscriptionFactory";

const { _debug } = makeConsole("loggingSubscriptionFactory");

export const loggingSubscriptionFactory: SubscriptionFactory = () => ({
  subscription: {
    set: (key, newValue) => {
      _debug("loggingSubscriptionFactory", `Setting ${key}`, newValue);
    },
    // get: key => {
    //   _debug("Store", `Getting ${key}`);
    // },
  },
});
