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

// This state is expected to be set up once on startup
type StartupState = { flags: ApplicationFlags; config: Config; auth: AuthResult };
const initialStartupState = { flags: undefined, config: undefined, auth: undefined };

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type ContextState = { context: FoundContext; domTags: Tags; caseDetails: CaseDetails };
const initialContextState = { context: undefined, domTags: {}, caseDetails: undefined };

// This state is general
type SummaryState = { fatalInitialisationError: Error | undefined; initialisationStatus: undefined | "ready" | "broken" };
const initialSummaryState = { fatalInitialisationError: undefined, initialisationStatus: undefined };

export type KnownState = StartupState & ContextState & SummaryState;

export type State = {
  [K in keyof KnownState]: KnownState[K] | undefined;
};

export type Register = (arg: Partial<State>) => void;

type TagSource = "path" | "dom" | "props";

export type UpdateTags = (arg: Pick<State, "domTags"> & { source: TagSource }) => void;

const initialState: State = {
  ...initialStartupState,
  ...initialContextState,
  ...initialSummaryState,
};

export type SubscriptionFactory = (arg: { store: typeof store; registerToStore: Register }) => Subscription<State>;

let store: ReturnType<typeof createStore<State>>;

export const initialiseStore = (...externalSubscriptions: SubscriptionFactory[]) => {
  // Yuck.  When clearing tags on SPA navigation, we still want to retain any tags tht have been supplied via
  //  properties passed to the web component.  There is probably a more elegant way to do this, but for the
  //  time being we just keep a record if how each tag has been added so we can retain those that are props.
  let internalState = { tagSources: {} as Record<string, TagSource> };

  store = createStore<State>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  const register = (arg: Partial<State>) => (Object.keys(arg) as (keyof State)[]).forEach(key => store.set(key, arg[key]));

  const updateTags: UpdateTags = ({ domTags: tags, source }) => {
    store.set("domTags", { ...store.get("domTags"), ...tags });
    internalState.tagSources = { ...internalState.tagSources, ...Object.keys(tags || {}).reduce((acc, key) => ({ ...acc, [key]: source }), {}) };
  };

  const resetTags = () => {
    _console.debug("Store", "Resetting tags", { tagSources: internalState.tagSources, tags: store.state.domTags });
    const entriesToKeep = Object.entries(store.get("domTags") || {}).filter(([key]) => internalState.tagSources[key] === "props");
    store.set(
      "domTags",
      entriesToKeep.reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
    );
    internalState.tagSources = entriesToKeep.reduce((acc, [key]) => ({ ...acc, [key]: internalState.tagSources[key] }), {});
    _console.debug("Store", "Reset tags", { tagSources: internalState.tagSources, tags: store.state.domTags });
  };

  store.use(
    ...[resetPreventionSubscription, loggingSubscription, initialisationStatusSubscription, ...externalSubscriptions].map(subscription =>
      subscription({ store, registerToStore: register }),
    ),
  );

  return { register, updateTags, resetTags };
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
