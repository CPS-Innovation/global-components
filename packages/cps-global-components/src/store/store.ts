import { createStore } from "@stencil/store";
import { getRenderingRef, forceUpdate } from "@stencil/core";
import { Config, Preview } from "cps-global-configuration";
import { AuthResult } from "../services/auth/AuthResult";
import { FoundContext } from "../services/context/FoundContext";
import { ApplicationFlags } from "../services/application-flags/ApplicationFlags";
import { loggingSubscriptionFactory } from "./subscriptions/logging-subscription-factory";
import { resetPreventionSubscriptionFactory } from "./subscriptions/reset-prevention-subscription-factory";
import { Tags } from "../services/context/Tags";
import { CorrelationIds } from "../services/correlation/CorrelationIds";
import { tagsSubscriptionFactory } from "./subscriptions/tags-subscription-factory";
import { applyOnChangeHandler, SubscriptionFactory } from "./subscriptions/SubscriptionFactory";
import { CaseDetails } from "../services/data/CaseDetails";
import { ReadyStateHelper, readyStateFactory } from "./ready-state-factory";
import { CaseIdentifiers } from "../services/context/CaseIdentifiers";
import { caseIdentifiersSubscriptionFactory } from "./subscriptions/case-identifiers-subscription-factory";
import { Handover } from "../services/state/handover/Handover";
import { Result } from "../utils/Result";
import { CmsSessionHint } from "cps-global-configuration";
import { AuthHint } from "../services/state/auth-hint/initialise-auth-hint";
import { MonitoringCodes } from "../services/data/MonitoringCode";
import { RecentCases } from "../services/state/recent-cases/recent-cases";
export { type ReadyStateHelper };

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
export const privateTagProperties = ["pathTags", "domTags", "propTags", "caseDetailsTags", "cmsSessionTags", "handoverTags"] as const;
export type PrivateTagProperties = (typeof privateTagProperties)[number]; // gives us a union definition: "pathTags" | "domTags" | "propTags"

// Transform a type Foo = {a: number, b: string} to FooUndefinable = {a: number | undefined, b: string | undefined}
type MakeUndefinable<T> = {
  [K in keyof T]: T[K] | undefined;
};

// This state is expected to be set up once on startup
type StartupState = {
  rootUrl: string;
  preview: Result<Preview>;
  flags: ApplicationFlags;
  config: Config;
  auth: AuthResult;
  authHint: Result<AuthHint>;
  build: Build;
  cmsSessionHint: Result<CmsSessionHint>;
  handover: Result<Handover>;
  recentCases: Result<RecentCases>;
  firstContext: FoundContext;
};

const initialStartupState = {
  rootUrl: undefined,
  preview: undefined,
  flags: undefined,
  config: undefined,
  auth: undefined,
  authHint: undefined,
  build: undefined,
  cmsSessionHint: undefined,
  handover: undefined,
  recentCases: undefined,
  firstContext: undefined,
};

// This state could change (e.g. history-based non-full-refresh navigation or dom tags changing)
type TransientState = {
  context: FoundContext;
  propTags: Tags;
  pathTags: Tags;
  domTags: Tags;
  correlationIds: CorrelationIds;
  caseDetailsTags: Tags;
  cmsSessionTags: Tags;
  handoverTags: Tags;
  caseIdentifiers: CaseIdentifiers;
  caseDetails: Result<CaseDetails>;
  caseMonitoringCodes: Result<MonitoringCodes>;
};
const initialTransientState = {
  context: undefined,
  propTags: undefined,
  pathTags: undefined,
  domTags: undefined,
  correlationIds: undefined,
  caseDetailsTags: undefined,
  cmsSessionTags: undefined,
  handoverTags: undefined,
  caseIdentifiers: undefined,
  caseDetails: undefined,
  caseMonitoringCodes: undefined,
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

export type MergeTags = (arg: SingleKnownTypePropertyOf<TransientState, Tags>) => Tags;

export type Subscribe = (...factories: SubscriptionFactory[]) => void;

export type Store = ReturnType<typeof createStore<StoredState>>;

export type Build = typeof window.cps_global_components_build;

const initialState: StoredState = {
  ...initialStartupState,
  ...initialTransientState,
  ...initialAggregateState,
  ...initialSummaryState,
};

let _mergeTags: MergeTags | undefined;

export const initialiseStore = () => {
  const store: Store = createStore<StoredState>(
    () => ({
      ...initialState,
    }),
    (newValue, oldValue) => JSON.stringify(newValue) !== JSON.stringify(oldValue),
  );

  readyState = readyStateFactory(store);

  // Workaround for @stencil/store WeakRef bug: the built-in stencil subscription
  // (added by createStore) tracks component instances via WeakRef. V8's GC can collect
  // these before async store updates arrive, silently breaking reactivity. This
  // supplementary subscription uses strong refs with periodic cleanup of disconnected
  // elements, matching what the built-in subscription intended but with reliable retention.

  // We first detected this as a problem in https://github.com/stenciljs/store/releases/tag/v2.2.2.
  // Feel free to remove the following code after upgrading to a future version, the e2e tests
  //  will show if the bug is still present or not.
  const elms = new Map<string, Set<any>>();
  store.use({
    get: propName => {
      const ref = getRenderingRef();
      if (ref) {
        let set = elms.get(propName as string);
        if (!set) {
          set = new Set();
          elms.set(propName as string, set);
        }
        set.add(ref);
      }
    },
    set: propName => {
      const set = elms.get(propName as string);
      if (set) {
        set.forEach(ref => forceUpdate(ref));
      }
    },
  });

  const register = (arg: Partial<StoredState>) => Object.keys(arg).forEach((key: keyof StoredState) => store.set(key, arg[key]));

  const storeMergeTags: MergeTags = arg => {
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
    privateTagProperties.filter(key => !["propTags", "cmsSessionTags", "handoverTags"].includes(key)).forEach(key => store.set(key, {}));
  };

  const subscribe: Subscribe = (...subscriptionFactories: SubscriptionFactory[]) =>
    subscriptionFactories.map(factory => {
      const { type, handler } = factory({ register, mergeTags: storeMergeTags, get: store.get });
      if (type === "subscription") {
        store.use(handler);
      } else {
        applyOnChangeHandler(store, handler);
      }
    });

  subscribe(resetPreventionSubscriptionFactory, loggingSubscriptionFactory, tagsSubscriptionFactory, caseIdentifiersSubscriptionFactory);

  _mergeTags = storeMergeTags;

  return { readyState, register, mergeTags: storeMergeTags, resetContextSpecificTags, subscribe, get: store.get };
};

export const mergeTags: MergeTags = arg => {
  if (!_mergeTags) {
    throw new Error("mergeTags called before store initialisation");
  }
  return _mergeTags(arg);
};

export let readyState: ReadyStateHelper;
