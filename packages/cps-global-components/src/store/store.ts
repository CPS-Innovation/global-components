import { createStore } from "@stencil/store";
import { makeConsole } from "../logging/makeConsole";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/AuthResult";
import { FoundContext } from "../services/context/FoundContext";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { loggingSubscriptionFactory } from "./subscriptions/logging-subscription-factory";
import { resetPreventionSubscriptionFactory } from "./subscriptions/reset-prevention-subscription-factory";
import { CaseDetails } from "../services/data/types";
import { Tags } from "../services/context/Tags";
import { withLogging } from "../logging/with-logging";
import { CorrelationIds } from "../services/correlation/CorrelationIds";
import { tagsSubscriptionFactory } from "./subscriptions/tags-subscription-factory";
import { SubscriptionFactory } from "./subscriptions/SubscriptionFactory";

const { _debug } = makeConsole("store");

// Helper type to extract keys of a specific type
type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

type SinglePropertyOf<T, PropType> = {
  [K in KeysOfType<T, PropType>]: Record<K, T[K]> & Partial<Record<Exclude<KeysOfType<T, PropType>, K>, never>>;
}[KeysOfType<T, PropType>];

export const privateTagProperties = ["pathTags", "domTags", "propTags"] as const;
export type PrivateTagProperties = (typeof privateTagProperties)[number]; // gives us a union definition: "pathTags" | "domTags" | "propTags"

type MakeUndefinable<T> = {
  [K in keyof T]: T[K] | undefined;
};

// This state is expected to be set up once on startup
type StartupState = {
  flags: ApplicationFlags;
  config: Config;
  auth: AuthResult;
};
const initialStartupState = {
  flags: undefined,
  config: undefined,
  auth: undefined,
};

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type TransientState = {
  context: FoundContext;
  propTags: Tags;
  pathTags: Tags;
  domTags: Tags;
  caseDetails: CaseDetails;
  correlationIds: CorrelationIds;
};
const initialTransientState = {
  context: undefined,
  propTags: undefined,
  pathTags: undefined,
  domTags: undefined,
  caseDetails: undefined,
  correlationIds: undefined,
};

type AggregateState = {
  tags: Tags;
};
const initialAggregateState = {
  tags: undefined,
};

// This state is general
type SummaryState = {
  fatalInitialisationError: Error | undefined;
};
const initialSummaryState = {
  fatalInitialisationError: undefined,
};

type DefinedStoredState = StartupState & TransientState & AggregateState & SummaryState;

export type StoredState = MakeUndefinable<DefinedStoredState>;

export type Register = (arg: Partial<StoredState>) => void;

export type MergeTags = (arg: SinglePropertyOf<TransientState, Tags>) => Tags;

const initialState: StoredState = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialAggregateState,
  ...initialSummaryState,
};

let store: ReturnType<typeof createStore<StoredState>>;

export const initialiseStore = () => {
  store = createStore<StoredState>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  const register = (arg: Partial<StoredState>) => Object.keys(arg).forEach((key: keyof StoredState) => store.set(key, arg[key]));

  const mergeTags: MergeTags = arg => {
    const key = Object.keys(arg)[0] as KeysOfType<TransientState, Tags>;
    const nextValue = { ...store.get(key), ...arg[key] } as Tags;
    store.set(key, nextValue);
    // Let's let the caller know the full condition of the tags post-merge
    return nextValue;
  };

  const resetContextSpecificTags = () => {
    // Note: tags obtained from props passed from the host apps should not be cleared on context change.
    //  They are subject to being updated via @Watch so all good there, but we definitely do not want
    //  the tags from one context (e.g. caseId = 123) hanging around for the next context in an SPA
    //  navigation (e.g. caseId = 456).
    privateTagProperties.filter(key => key !== "propTags").forEach(key => store.set(key, {}));
  };

  const subscribe = (...subscriptionFactories: SubscriptionFactory[]) => {
    _debug("store", "subscribe", subscriptionFactories);
    return subscriptionFactories.map(factory => {
      const { subscription, triggerSetOnRegister } = factory({ set: store.set, get: store.get });
      const unSubscriber = store.use(subscription);

      if (triggerSetOnRegister) {
        subscription.set?.(triggerSetOnRegister.key, store.get(triggerSetOnRegister.key), undefined);
      }

      return unSubscriber;
    });
  };

  subscribe(resetPreventionSubscriptionFactory, loggingSubscriptionFactory, tagsSubscriptionFactory);

  return { register, mergeTags, resetContextSpecificTags, subscribe };
};

// This state is computed from the stored state
type DerivedState = { initialisationStatus: undefined | "ready" | "broken" };

// todo: rethink if we need this - so far it is only used to let e2e tests know they
//  are ready to run
const getInitialisationStatus = (): DerivedState["initialisationStatus"] => {
  if (store.state.fatalInitialisationError) {
    return "broken";
  }
  const keysToIgnore: (keyof StoredState)[] = ["fatalInitialisationError", "caseDetails", ...privateTagProperties];

  const storeIsNotComplete = Object.keys(store.state)
    .filter((key: keyof StoredState) => !keysToIgnore.includes(key))
    .some(key => store.state[key] === undefined);

  if (storeIsNotComplete) {
    return undefined;
  }

  return "ready";
};

export type State = DefinedStoredState & DerivedState;
type StateWithoutPrivateTags = Omit<State, PrivateTagProperties>;

type NonUndefined<T> = T extends undefined ? never : T;

type AllDefined = {
  [K in keyof StateWithoutPrivateTags]: NonUndefined<StateWithoutPrivateTags[K]>;
};

// Helper type to override specific keys with non-undefined versions while keeping all other keys
type OverrideKeys<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? NonUndefined<T[P]> : T[P];
};

// When ready: requested properties are guaranteed non-undefined, all other properties are accessible (potentially undefined)
// When not ready: all properties are accessible and potentially undefined
type PickIfReadyReturn<K extends readonly (keyof StateWithoutPrivateTags)[]> = K extends readonly [] ? AllDefined : OverrideKeys<StateWithoutPrivateTags, K[number]>;

const readyStateInternal = <K extends readonly (keyof StateWithoutPrivateTags)[] = readonly []>(
  ...keys: K
):
  | { isReady: true; state: PickIfReadyReturn<K> & Pick<StateWithoutPrivateTags, "initialisationStatus" | "fatalInitialisationError"> }
  | { isReady: false; state: StateWithoutPrivateTags } => {
  const alwaysReturnedState = { fatalInitialisationError: store.state.fatalInitialisationError, initialisationStatus: getInitialisationStatus() };

  // When a render function access a store the internals of the library are setting up observers see
  //  https://github.com/stenciljs/store/blob/4579ad531211d1777798fa994d779fefdec5c814/src/subscriptions/stencil.ts#L36
  //  This is done so that the store knows which components are interested in which top-level properties of the store. Whenever
  //  a property changes the store can trigger a rerendering of the components that have enlisted as observers at any point
  //  by having read that property.
  // In the code below we must ensure that we visit every property listed in `keysToCheck` otherwise we may miss registering
  //  to observe a property.
  for (const key of keys) {
    store.state[key];
  }

  // Return ALL properties from the store (for lazy access)
  const result: any = {
    ...store.state,
  };

  // Check if all requested keys are defined
  const isReady = !keys.filter(key => key != "tags").some(key => store.state[key] === undefined);

  return isReady
    ? { isReady: true, state: { ...(result as PickIfReadyReturn<K>), ...alwaysReturnedState } }
    : { isReady: false, state: { ...(result as StateWithoutPrivateTags), ...alwaysReturnedState } };
};

export const readyState = withLogging("readyState", readyStateInternal);
