import { createStore, Subscription } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/initialise-auth";
import { FoundContext } from "../services/context/FoundContext";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { initialisationStatusSubscription } from "./subscriptions/initialisation-status-subscription";
import { loggingSubscription } from "./subscriptions/logging-subscription";
import { resetPreventionSubscription } from "./subscriptions/reset-prevention-subscription";
import { CaseDetails } from "../services/data/types";
import { Tags } from "../services/context/Tags";

type MakeUndefinable<T> = {
  [K in keyof T]: T[K] | undefined;
};

// This state is expected to be set up once on startup
type StartupState = { flags: ApplicationFlags; config: Config; auth: AuthResult };
const initialStartupState = { flags: undefined, config: undefined, auth: undefined };

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type TransientState = { context: FoundContext; propTags: Tags; pathTags: Tags; domTags: Tags; caseDetails: CaseDetails };
const initialTransientState = { context: undefined, propTags: undefined, pathTags: undefined, domTags: undefined, caseDetails: undefined };

// This state is general
type SummaryState = { fatalInitialisationError: Error | undefined; initialisationStatus: undefined | "ready" | "broken" };
const initialSummaryState = { fatalInitialisationError: undefined, initialisationStatus: undefined };
type DerivedState = { readonly tags: Tags };

export type KnownState = StartupState & TransientState & SummaryState & DerivedState;

export type State = MakeUndefinable<KnownState>;

export type Register = (arg: Partial<State>) => void;

const initialState: MakeUndefinable<StartupState & TransientState & SummaryState> = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialSummaryState,
};

export type SubscriptionFactory = (arg: { store: typeof store; registerToStore: Register }) => Subscription<State>;

let store: ReturnType<typeof createStore<State & MakeUndefinable<DerivedState>>>;

export const initialiseStore = (...externalSubscriptions: SubscriptionFactory[]) => {
  const internalStore = createStore<MakeUndefinable<StartupState & TransientState & SummaryState>>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  // Add a readonly property
  Object.defineProperty(internalStore.state, "tags", {
    get() {
      const state = this as State;
      _console.debug("This", this);
      return { ...state.domTags, ...state.pathTags, ...state.propTags };
    },
    enumerable: true,
    configurable: false,
  });

  store = internalStore as any;

  const register = (arg: Partial<State>) => (Object.keys(arg) as (keyof State)[]).forEach(key => store.set(key, arg[key]));

  const resetContextSpecificTags = () => {
    // Note: tags obtained from props passed from the host apps should not be cleared on context change.
    //  They are subject to being updated via @Watch so all good there, but we definitely do not want
    //  the tags from one context (e.g. caseId = 123) hanging around for the next context in an SPA
    //  navigation (e.g. caseId = 456).
    store.set("pathTags", {});
    store.set("domTags", {});
  };

  store.use(
    ...[resetPreventionSubscription, loggingSubscription, initialisationStatusSubscription, ...externalSubscriptions].map(subscription =>
      subscription({ store, registerToStore: register }),
    ),
  );

  return { register, resetContextSpecificTags };
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
type PickIfReadyReturn<K extends readonly (keyof State)[]> = K extends readonly [] ? AllDefined | undefined : PickDefined<K[number]> | undefined;

export const readyState = <K extends readonly (keyof State)[] = readonly []>(...keys: K): { state: PickIfReadyReturn<K> } & SummaryState => {
  const keysToCheck = keys.length === 0 ? (Object.keys(store.state) as (keyof State)[]) : keys;

  const summaryState = { fatalInitialisationError: store.state.fatalInitialisationError, initialisationStatus: store.state.initialisationStatus };

  // When a render function access a store the internals of the library are setting up observers see
  //  https://github.com/stenciljs/store/blob/4579ad531211d1777798fa994d779fefdec5c814/src/subscriptions/stencil.ts#L36
  //  This is done so that the store knows which components are interested in which top-level properties of the store. Whenever
  //  a property changes the store can trigger a rerendering of the components that have enlisted as observers at any point
  //  by having read that property.
  // In the code below we must ensure that we visit every property listed in `keysToCheck` otherwise we may miss registering
  //  to observe a property.
  debugger;
  if (
    keysToCheck
      .map((key: keyof KnownState) => {
        store.state[key]; // just make sure we "get" every prop we are interested so we register with the store
        return key;
      })
      .some(key => store.state[key] === undefined)
  )
    return {
      state: undefined as PickIfReadyReturn<K>,
      ...summaryState,
    };

  const result: any = {};
  for (const key of keysToCheck) {
    result[key] = store.state[key];
  }

  return { state: result as PickIfReadyReturn<K>, ...summaryState };
};
