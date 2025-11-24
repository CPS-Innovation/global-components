import { createStore } from "@stencil/store";
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
import { applyOnChangeHandler, SubscriptionFactory } from "./subscriptions/SubscriptionFactory";
import { CaseDetails } from "../services/data/CaseDetails";
import { ReadyStateHelper, readyStateFactory } from "./ready-state-factory";
import { CaseIdentifiers } from "../services/context/CaseIdentifiers";
import { caseIdentifiersSubscriptionFactory } from "./subscriptions/case-identifiers-subscription-factory";
export { type ReadyStateHelper };

const registerEventName = "cps-global-components-register";
const mergeTagsEventName = "cps-global-components-merge-tags";

// Helper type to extract keys of a specific type
type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// Given a type Foo = {a: number, b: number} then SinglePropertyOf<Foo, number> would be
//  {a: 1} or {b: 1} but not {a: 1, b: 1}
type SingleKnownTypePropertyOf<T, PropType> = {
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
  correlationIds: CorrelationIds;
  caseDetailsTags: Tags;
  caseIdentifiers: CaseIdentifiers;
  caseDetails: CaseDetails;
};
const initialTransientState = {
  context: undefined,
  propTags: undefined,
  pathTags: undefined,
  domTags: undefined,
  correlationIds: undefined,
  caseDetailsTags: undefined,
  caseIdentifiers: undefined,
  caseDetails: undefined,
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
export type RegisterOnce = (arg: Partial<StoredState>) => void;
class RegisterEvent extends CustomEvent<Parameters<Register>[0]> {}

export type MergeTags = (arg: SingleKnownTypePropertyOf<TransientState, Tags>) => Tags;
export type MergeTagFireAndForget = (arg: SingleKnownTypePropertyOf<TransientState, Tags>) => void;
class MergeTagFireAndForgetEvent extends CustomEvent<Parameters<MergeTagFireAndForget>[0]> {}

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

  const subscribe = (...subscriptionFactories: SubscriptionFactory[]) =>
    subscriptionFactories.map(factory => {
      const { type, handler } = factory({ register, mergeTags, get: store.get });
      if (type === "subscription") {
        store.use(handler);
      } else {
        applyOnChangeHandler(store, handler);
      }
    });

  subscribe(resetPreventionSubscriptionFactory, loggingSubscriptionFactory, tagsSubscriptionFactory, caseIdentifiersSubscriptionFactory);

  document.addEventListener(
    registerEventName,
    withLogging(registerEventName, (event: RegisterEvent) => register(event.detail)),
  );

  return { readyState, register, mergeTags, resetContextSpecificTags, subscribe };
};

export const mergeTags: MergeTagFireAndForget = detail =>
  document.dispatchEvent(
    new MergeTagFireAndForgetEvent(mergeTagsEventName, {
      detail,
      bubbles: true,
      cancelable: true,
    }),
  );

export let readyState: ReadyStateHelper;
