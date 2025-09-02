import { createStore } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { Tags } from "@microsoft/applicationinsights-web";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";

export type KnownState = {
  fatalInitialisationError: Error;
  flags: ApplicationFlags;
  config: Config;
  context: FoundContext;
  auth: AuthResult;
  tags: Tags;
  initialisationStatus: "ready" | "broken";
};

export type State = {
  [K in keyof KnownState]: KnownState[K] | undefined;
};

export const initialInternalState: State = {
  flags: undefined,
  config: undefined,
  auth: undefined,
  context: undefined,
  tags: undefined,
  fatalInitialisationError: undefined,
  initialisationStatus: undefined,
};

export type Register = typeof registerToStore;

let store: ReturnType<typeof createStore<State>>;

export const initialiseStore = () => {
  store = createStore<State>(
    () => ({
      ...initialInternalState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  store.use({
    set: (key, newValue) => {
      _console.debug("Store", `Setting ${key}`, newValue?.toString());
      if (key === "initialisationStatus") {
        return;
      }

      if (key === "fatalInitialisationError" && !!newValue) {
        store.state.initialisationStatus = "broken";
        return;
      }

      const allStateKnown = Object.keys(store.state)
        .filter((key: keyof State) => key !== "initialisationStatus" && key != "fatalInitialisationError")
        .every(key => !!store.state[key]);
      const noError = !store.state.fatalInitialisationError;
      if (allStateKnown && noError) {
        store.state.initialisationStatus = "ready";
      }
    },
    reset: () => {
      throw new Error("We do not support resetting state - the initiation of state is done only in the startup of the app");
    },
  });
};

export const registerToStore = (arg: Partial<State>) => {
  (Object.keys(arg) as (keyof State)[]).forEach(key => store.set(key, arg[key]));
};

// Helper types
type NonUndefined<T> = T extends undefined ? never : T;

// Use a tuple to prevent distribution
type PickDefined<K extends keyof State> = Pick<State, K> & {
  [P in K]: NonUndefined<State[P]>;
};

type AllDefined = {
  [K in keyof State]: NonUndefined<State[K]>;
};

// Wrap K in a tuple [K] to prevent distribution
type PickIfReadyReturn<K extends readonly (keyof State)[]> = K extends readonly [] ? AllDefined | false : PickDefined<K[number]> | false;

export const readyState = <K extends readonly (keyof State)[] = readonly []>(...keys: K): PickIfReadyReturn<K> => {
  const keysToCheck = keys.length === 0 ? (Object.keys(store.state) as (keyof State)[]) : keys;

  for (const key of keysToCheck) {
    if (store.state[key] === undefined) {
      return false as PickIfReadyReturn<K>;
    }
  }

  const result: any = {};
  for (const key of keysToCheck) {
    result[key] = store.state[key];
  }

  return result as PickIfReadyReturn<K>;
};

export const rawState = () => store.state;
