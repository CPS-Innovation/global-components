import { State, SubscriptionFactory } from "../store";
import { _console } from "../../logging/_console";
import { getContextType } from "../../services/context/get-context-type";

export const initialisationStatusSubscription: SubscriptionFactory = ({ store, registerToStore }) => ({
  set: (key, newValue) => {
    if (key === "initialisationStatus") {
      return;
    }

    if (key === "fatalInitialisationError" && !!newValue) {
      registerToStore({ initialisationStatus: "broken" });
      return;
    }

    // todo: state machine or whatever to make our state transitions clear
    const context = store.state.context;
    if (!context) {
      return;
    }

    // We want to check all the necessary keys to see if we are "ready" or not
    const keysToIgnore: (keyof State)[] =
      getContextType(context) === "case-details"
        ? // if we are in a case, then these are the keys to ignore ...
          ["initialisationStatus", "fatalInitialisationError", "caseDetails"]
        : // ... otherwise we can also ignore caseIdentifiers as they will not be present
          ["initialisationStatus", "fatalInitialisationError", "caseDetails", "caseIdentifiers"];

    const keysNotYetSet = Object.keys(store.state)
      .filter((key: keyof State) => !keysToIgnore.includes(key))
      .filter(key => store.state[key] === undefined);

    const error = store.state.fatalInitialisationError;

    if (!keysNotYetSet.length && !error) {
      registerToStore({ initialisationStatus: "ready" });
    } else {
      _console.debug("Store status not yet ready", { keysNotYetSet, error });
    }
  },
});
