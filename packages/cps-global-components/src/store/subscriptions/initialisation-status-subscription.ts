import { State, SubscriptionFactory } from "../store";
import { isCaseContext } from "../../services/context/is-case-context";

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
    if (!context?.found) {
      return;
    }

    // We want to check all the necessary keys to see if we are "ready" or not
    const keysToIgnore: (keyof State)[] = isCaseContext(context)
      ? ["initialisationStatus", "fatalInitialisationError", "caseDetails", "caseIdentifiers"]
      : ["initialisationStatus", "fatalInitialisationError", "caseDetails"];

    const enoughStateKnown = Object.keys(store.state)
      .filter((key: keyof State) => !keysToIgnore.includes(key))
      .every(key => store.state[key] != undefined);

    const noError = !store.state.fatalInitialisationError;

    if (enoughStateKnown && noError) {
      registerToStore({ initialisationStatus: "ready" });
    }
  },
});
