import { createStore } from "@stencil/store";
import { _console } from "../logging/_console";
import { initialInternalState, State } from "./internal-state";

export type Register = typeof register;

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

export const register = (arg: Partial<State>) => {
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
