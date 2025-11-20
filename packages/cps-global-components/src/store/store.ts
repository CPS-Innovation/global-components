import { createStore } from "@stencil/store";
import { makeConsole } from "../logging/makeConsole";
import { Config } from "cps-global-configuration";
import { AuthResult } from "../services/auth/AuthResult";
import { FoundContext } from "../services/context/FoundContext";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { loggingSubscriptionFactory } from "./subscriptions/logging-subscription-factory";
import { resetPreventionSubscriptionFactory } from "./subscriptions/reset-prevention-subscription-factory";
import { Tags } from "../services/context/Tags";
import { withLogging } from "../logging/with-logging";
import { CorrelationIds } from "../services/correlation/CorrelationIds";
import { tagsSubscriptionFactory } from "./subscriptions/tags-subscription-factory";
import { SubscriptionFactory } from "./subscriptions/SubscriptionFactory";
import { CaseDetails } from "../services/data/CaseDetails";
import { ReadyState, readyStateFactory } from "./ready-state-factory";

const { _debug } = makeConsole("store");

const registerEventName = "cps-global-components-register";

// Helper type to extract keys of a specific type
type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// Given a type Foo = {a: number, b: number} then SinglePropertyOf<Foo, number> would be
//  {a: 1} or {b: 1} but not {a: 1, b: 1}
type SinglePropertyOf<T, PropType> = {
  [K in KeysOfType<T, PropType>]: Record<K, T[K]> & Partial<Record<Exclude<KeysOfType<T, PropType>, K>, never>>;
}[KeysOfType<T, PropType>];

// With tags we want the world to use "tags" rather than the constituent sub-tag objects
export const privateTagProperties = ["pathTags", "domTags", "propTags"] as const;
export type PrivateTagProperties = (typeof privateTagProperties)[number]; // gives us a union definition: "pathTags" | "domTags" | "propTags"

// Transform a type Foo = {a: number, b: string} to FooUndefinable = {a: number | undefined, b: string | undefined}
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
  caseDetailsTags: Tags;
  caseDetails: CaseDetails;
  correlationIds: CorrelationIds;
};
const initialTransientState = {
  context: undefined,
  propTags: undefined,
  pathTags: undefined,
  domTags: undefined,
  caseDetailsTags: undefined,
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
  initialisationStatus: undefined | "complete" | "broken";
};

const initialSummaryState = {
  fatalInitialisationError: undefined,
  initialisationStatus: undefined,
};

export type State = StartupState & TransientState & AggregateState & SummaryState;

export type StoredState = MakeUndefinable<State>;

export type Register = (arg: Partial<StoredState>) => void;
class RegisterEvent extends CustomEvent<Parameters<Register>[0]> {}

export type MergeTags = (arg: SinglePropertyOf<TransientState, Tags>) => Tags;

export type Store = ReturnType<typeof createStore<StoredState>>;

const initialState: StoredState = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialAggregateState,
  ...initialSummaryState,
};

export const initialiseStore = () => {
  const store: Store = createStore<StoredState>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  readyState = readyStateFactory(store);

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
      const { subscription, triggerSetOnCreation: triggerSetOnRegister } = factory({ set: store.set, get: store.get });
      const unSubscriber = store.use(subscription);

      if (triggerSetOnRegister) {
        subscription.set?.(triggerSetOnRegister.key, store.get(triggerSetOnRegister.key), undefined);
      }

      return unSubscriber;
    });
  };

  subscribe(resetPreventionSubscriptionFactory, loggingSubscriptionFactory, tagsSubscriptionFactory);

  document.addEventListener(
    registerEventName,
    withLogging(registerEventName, (event: RegisterEvent) => register(event.detail)),
  );

  return { register, mergeTags, resetContextSpecificTags, subscribe };
};

export const register: Register = detail =>
  document.dispatchEvent(
    new RegisterEvent(registerEventName, {
      detail,
      bubbles: true,
      cancelable: true,
    }),
  );

export let readyState: ReadyState;
