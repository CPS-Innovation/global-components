import { createStore, Subscription } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/find-context";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { initialisationStatusSubscription } from "./subscriptions/initialisation-status-subscription";
import { caseIdentifiersSubscription } from "./subscriptions/case-identifiers-subscription";
import { CaseIdentifiers } from "../services/context/CaseIdentifiers";
import { loggingSubscription } from "./subscriptions/logging-subscription";
import { resetPreventionSubscription } from "./subscriptions/reset-prevention-subscription";
import { CaseDetails } from "../services/data/types";
import { Tags } from "../services/context/Tags";

// This state is expected to be set up once on startup
type StartupState = { flags: ApplicationFlags; config: Config; auth: AuthResult };
const initialStartupState = { flags: undefined, config: undefined, auth: undefined };

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type ContextState = { context: FoundContext; tags: Tags; caseIdentifiers: CaseIdentifiers; caseDetails: CaseDetails };
const initialContextState = { context: undefined, tags: undefined, caseIdentifiers: undefined, caseDetails: undefined };

// This state is general
type SummaryState = { fatalInitialisationError: Error; initialisationStatus: "ready" | "broken" };
const initialSummaryState = { fatalInitialisationError: undefined, initialisationStatus: undefined };

export type KnownState = StartupState & ContextState & SummaryState;

export type State = {
  [K in keyof KnownState]: KnownState[K] | undefined;
};

export type Register = (arg: Partial<State>) => void;

export const initialInternalState: State = {
  ...initialStartupState,
  ...initialContextState,
  ...initialSummaryState,
};

export type SubscriptionFactory = (arg: { store: typeof store; registerToStore: Register }) => Subscription<State>;

let store: ReturnType<typeof createStore<State>>;

export const initialiseStore = (...externalSubscriptions: SubscriptionFactory[]) => {
  store = createStore<State>(
    () => ({
      ...initialInternalState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  const registerToStore = (arg: Partial<State>) => {
    (Object.keys(arg) as (keyof State)[]).forEach(key => store.set(key, arg[key]));
  };

  store.use(
    ...[resetPreventionSubscription, loggingSubscription, initialisationStatusSubscription, caseIdentifiersSubscription, ...externalSubscriptions].map(subscription =>
      subscription({ store, registerToStore }),
    ),
  );

  return { registerToStore };
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
