import { createStore, Subscription } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/AuthResult";
import { FoundContext } from "../services/context/FoundContext";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { loggingSubscription } from "./subscriptions/logging-subscription";
import { resetPreventionSubscription } from "./subscriptions/reset-prevention-subscription";
import { CaseDetails } from "../services/data/types";
import { Tags } from "../services/context/Tags";
import { withLogging } from "../logging/with-logging";
import { CorrelationIds } from "../services/correlation/CorrelationIds";

type MakeUndefinable<T> = {
  [K in keyof T]: T[K] | undefined;
};

// This state is expected to be set up once on startup
type StartupState = { flags: ApplicationFlags; config: Config; auth: AuthResult };
const initialStartupState = { flags: undefined, config: undefined, auth: undefined };

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type TransientState = { context: FoundContext; propTags: Tags; pathTags: Tags; domTags: Tags; caseDetails: CaseDetails; correlationIds: CorrelationIds };
const initialTransientState = { context: undefined, propTags: undefined, pathTags: undefined, domTags: undefined, caseDetails: undefined, correlationIds: undefined };

// This state is general
type SummaryState = { fatalInitialisationError: Error | undefined };
const initialSummaryState = { fatalInitialisationError: undefined };

type DefinedStoredState = StartupState & TransientState & SummaryState;

type StoredState = MakeUndefinable<DefinedStoredState>;

export type Register = (arg: Partial<StoredState>) => void;

const initialState: StoredState = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialSummaryState,
};

export type SubscriptionFactory = (arg: { store: typeof store; register: Register; getTags: typeof getTags }) => Subscription<StoredState>;

let store: ReturnType<typeof createStore<StoredState>>;

export const initialiseStore = (...externalSubscriptions: SubscriptionFactory[]) => {
  store = createStore<StoredState>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  const register = (arg: Partial<StoredState>) => (Object.keys(arg) as (keyof StoredState)[]).forEach(key => store.set(key, arg[key]));

  const resetContextSpecificTags = () => {
    // Note: tags obtained from props passed from the host apps should not be cleared on context change.
    //  They are subject to being updated via @Watch so all good there, but we definitely do not want
    //  the tags from one context (e.g. caseId = 123) hanging around for the next context in an SPA
    //  navigation (e.g. caseId = 456).
    privateTagProperties.filter(key => key !== "propTags").forEach(key => store.set(key, {}));
  };

  store.use(...[resetPreventionSubscription, loggingSubscription, ...externalSubscriptions].map(subscription => subscription({ store, register, getTags })));

  return { register, resetContextSpecificTags };
};

// This state is computed from the stored state
type DerivedState = { tags: Tags; initialisationStatus: undefined | "ready" | "broken" };

const privateTagProperties = ["pathTags", "domTags", "propTags"] as const;
type PrivateTagProperties = (typeof privateTagProperties)[number]; // gives us a union definition: "pathTags" | "domTags" | "propTags"
export const isATagProperty = (key: keyof StoredState): key is PrivateTagProperties => privateTagProperties.includes(key as PrivateTagProperties);

const getTags = (): Tags => ({
  // Note 1: Order is important here. Our logic is: if a tag is found in domTags then it
  //  overrides a tag found in the path (domTags would generally arrive later than pathTags)
  //  and we use domTags to get better information than available in the path.
  //  Prop tags should override everything as they are actively supplied by the host.
  // Note 2: a design decision. Lets say that "tags" is never undefined.  DomTags for instance
  //  may come in at any time post-initialisation as the DOM changes, so there is always
  //  going to be an element of laziness to tags.  The calling code should work with the fact
  //  that tags will be defined from the start is expected to be populated at any time from
  //  initialisation onwards.
  ...store.state.pathTags,
  ...store.state.domTags,
  ...store.state.propTags,
});

const getInitialisationStatus = (): DerivedState["initialisationStatus"] => {
  if (store.state.fatalInitialisationError) {
    return "broken";
  }
  const keysToIgnore: (keyof StoredState)[] = ["fatalInitialisationError", "caseDetails", ...privateTagProperties];

  const storeIsNotComplete = Object.keys(store.state)
    .filter((key: keyof StoredState) => !keysToIgnore.includes(key))
    .some(key => store.state[key] === undefined);

  if (storeIsNotComplete || !getTags()) {
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
    if (key === "tags") {
      getTags();
    } else {
      store.state[key];
    }
  }

  // Return ALL properties from the store (for lazy access)
  const result: any = {
    ...store.state,
    tags: getTags(),
  };

  // Check if all requested keys are defined
  const isReady = !keys.filter(key => key != "tags").some(key => store.state[key] === undefined);

  if (isReady) {
    return { isReady: true, state: { ...(result as PickIfReadyReturn<K>), ...alwaysReturnedState } };
  } else {
    return { isReady: false, state: { ...(result as StateWithoutPrivateTags), ...alwaysReturnedState } };
  }
};

export const readyState = withLogging("readyState", readyStateInternal);
