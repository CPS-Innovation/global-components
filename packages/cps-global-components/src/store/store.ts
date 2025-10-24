import { createStore, Subscription } from "@stencil/store";
import { _console } from "../logging/_console";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/AuthResult";
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

type CoreKnownState = StartupState & TransientState & SummaryState;

type CoreState = MakeUndefinable<CoreKnownState>;

export type Register = (arg: Partial<CoreState>) => void;

const initialState: CoreState = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialSummaryState,
};

export type SubscriptionFactory = (arg: { store: typeof store; registerToStore: Register }) => Subscription<CoreState>;

let store: ReturnType<typeof createStore<CoreState>>;

export const initialiseStore = (...externalSubscriptions: SubscriptionFactory[]) => {
  store = createStore<CoreState>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  const register = (arg: Partial<CoreState>) => (Object.keys(arg) as (keyof CoreState)[]).forEach(key => store.set(key, arg[key]));

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

// This state is computed from
type DerivedState = { tags: Tags };

export type State = CoreKnownState & DerivedState;

type StateWithoutPrivateTags = Omit<State, "pathTags" | "propTags" | "domTags">;

type NonUndefined<T> = T extends undefined ? never : T;

// Use a tuple to prevent distribution
type PickDefined<K extends keyof StateWithoutPrivateTags> = Pick<StateWithoutPrivateTags, K> & {
  [P in K]: NonUndefined<StateWithoutPrivateTags[P]>;
};

type AllDefined = {
  [K in keyof StateWithoutPrivateTags]: NonUndefined<StateWithoutPrivateTags[K]>;
};

// Wrap K in a tuple [K] to prevent distribution
type PickIfReadyReturn<K extends readonly (keyof StateWithoutPrivateTags)[]> = K extends readonly [] ? AllDefined | undefined : PickDefined<K[number]> | undefined;

export const readyState = <K extends readonly (keyof StateWithoutPrivateTags)[] = readonly []>(
  ...keys: K
): { isReady: true; state: PickIfReadyReturn<K> & SummaryState } | { isReady: false; state: SummaryState } => {
  const keysToCheck = keys.length === 0 ? (Object.keys(store.state) as (keyof CoreState)[]) : keys;

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
      .filter(key => key !== ("tags" as keyof State))
      .map((key: keyof CoreState) => {
        store.state[key]; // just make sure we "get" every prop we are interested so we register with the store
        return key;
      })
      .some(key => store.state[key] === undefined)
  )
    return {
      isReady: false,
      state: { ...summaryState },
    };

  const result: any = {};
  for (const key of keysToCheck) {
    result[key] =
      key === "tags"
        ? ({
            // Order is important here. Our logic is: if a tag is found in domTags then it
            //  overrides a tag found in the path (domTags would generally arrive later than pathTags)
            //  and we use domTags to get better information than available in the path.
            //  Prop tags should override everything as they are actively supplied by the host.
            ...store.state.pathTags,
            ...store.state.domTags,
            ...store.state.propTags,
          } as Tags)
        : store.state[key];
  }

  return { isReady: true, state: { ...(result as PickIfReadyReturn<K>), ...summaryState } };
};
