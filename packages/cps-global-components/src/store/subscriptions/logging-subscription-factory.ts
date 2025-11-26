import { makeConsole } from "../../logging/makeConsole";
import { SubscriptionFactory } from "./SubscriptionFactory";

const { _debug } = makeConsole("loggingSubscriptionFactory");

export const loggingSubscriptionFactory: SubscriptionFactory = () => ({
  type: "subscription",
  handler: {
    set: (key, newValue) => {
      _debug(`Setting ${key}`, newValue);
    },
    // get: key => {
    //   _debug("Store", `Getting ${key}`);
    // },
  },
});
