import { createStore } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { Tags } from "@microsoft/applicationinsights-web";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";

export type KnownState = { fatalInitialisationError: Error; flags: ApplicationFlags; config: Config; context: FoundContext; auth: AuthResult; tags: Tags };

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
};

export type Register = typeof registerToStore;

let store: ReturnType<typeof createStore<State>>;

let stateCache: State;

export const initialiseStore = () => {
  store = createStore<State>(
    () => ({
      ...initialInternalState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );
  stateCache = store.state;

  store.use({
    set: (key, newValue) => _console.debug("Store", `Setting ${key}`, newValue),
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
  const keysToCheck = keys.length === 0 ? (Object.keys(stateCache) as (keyof State)[]) : keys;

  for (const key of keysToCheck) {
    if (stateCache[key] === undefined) {
      return false as PickIfReadyReturn<K>;
    }
  }

  const result: any = {};
  for (const key of keysToCheck) {
    result[key] = stateCache[key];
  }

  return result as PickIfReadyReturn<K>;
};

export const rawState = () => stateCache;
