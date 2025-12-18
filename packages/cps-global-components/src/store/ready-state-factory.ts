import { PrivateTagProperties, State, Store } from "./store";

type StateWithoutPrivateTags = Omit<State, PrivateTagProperties>;

type NonUndefined<T> = T extends undefined ? never : T;

type AllDefined = {
  [K in keyof StateWithoutPrivateTags]: NonUndefined<StateWithoutPrivateTags[K]>;
};

// Properties that are always returned regardless of what's requested
type AlwaysReturned = Pick<StateWithoutPrivateTags, "fatalInitialisationError" | "initialisationStatus">;

// When ready with required keys: those keys are guaranteed non-undefined
// When ready with no required keys: all properties guaranteed non-undefined
type RequiredReturn<R extends readonly (keyof StateWithoutPrivateTags)[]> =
  R extends readonly [] ? AllDefined : Pick<AllDefined, R[number]>;

// Optional keys keep their original (potentially undefined) types
type OptionalReturn<O extends readonly (keyof StateWithoutPrivateTags)[]> =
  O extends readonly [] ? unknown : Pick<StateWithoutPrivateTags, O[number]>;

type ReadyResult<R extends readonly (keyof StateWithoutPrivateTags)[], O extends readonly (keyof StateWithoutPrivateTags)[]> =
  | { isReady: true; state: RequiredReturn<R> & OptionalReturn<O> & AlwaysReturned }
  | { isReady: false; state: StateWithoutPrivateTags };

// Overload signatures
type ReadyStateFunction = {
  // Overload 1: No arguments - returns all properties
  (): ReadyResult<readonly [], readonly []>;

  // Overload 2: Rest params (original API) - all keys are required
  <K extends (keyof StateWithoutPrivateTags)[]>(...keys: K): ReadyResult<K, readonly []>;

  // Overload 3: Two arrays - required + optional keys
  <R extends readonly (keyof StateWithoutPrivateTags)[], O extends readonly (keyof StateWithoutPrivateTags)[]>(
    required: R,
    optional: O
  ): ReadyResult<R, O>;
};

export type ReadyStateHelper = ReadyStateFunction;

export const readyStateFactory = (store: Store): ReadyStateFunction => {
  return ((...args: any[]): any => {
    // Compute always-returned state fresh each call to get current values
    const alwaysReturnedState: AlwaysReturned = {
      fatalInitialisationError: store.state.fatalInitialisationError,
      initialisationStatus: store.state.initialisationStatus,
    };
    let requiredKeys: (keyof StateWithoutPrivateTags)[];
    let optionalKeys: (keyof StateWithoutPrivateTags)[];

    if (args.length === 0) {
      // No arguments - all properties mode
      requiredKeys = [];
      optionalKeys = [];
    } else if (Array.isArray(args[0])) {
      // Two arrays mode: required + optional
      requiredKeys = args[0] as (keyof StateWithoutPrivateTags)[];
      optionalKeys = (args[1] ?? []) as (keyof StateWithoutPrivateTags)[];
    } else {
      // Rest params mode (original API) - all keys are required
      requiredKeys = args as (keyof StateWithoutPrivateTags)[];
      optionalKeys = [];
    }

    const allKeys = [...requiredKeys, ...optionalKeys];

    // When a render function access a store the internals of the library are setting up observers see
    //  https://github.com/stenciljs/store/blob/4579ad531211d1777798fa994d779fefdec5c814/src/subscriptions/stencil.ts#L36
    //  This is done so that the store knows which components are interested in which top-level properties of the store. Whenever
    //  a property changes the store can trigger a rerendering of the components that have enlisted as observers at any point
    //  by having read that property.
    // In the code below we must ensure that we visit every property listed in allKeys otherwise we may miss registering
    //  to observe a property.
    for (const key of allKeys) {
      store.state[key];
    }

    // Check if all required keys are defined (tags is exempt from this check)
    const isReady = !requiredKeys.filter(key => key !== "tags").some(key => store.state[key] === undefined);

    if (isReady) {
      // When ready, only return the picked properties (or all if no keys specified)
      const result: any =
        allKeys.length === 0
          ? { ...store.state }
          : allKeys.reduce((acc, key) => ({ ...acc, [key]: store.state[key] }), {});
      return { isReady: true, state: { ...result, ...alwaysReturnedState } };
    } else {
      return { isReady: false, state: { ...(store.state as StateWithoutPrivateTags), ...alwaysReturnedState } };
    }
  }) as ReadyStateFunction;
};
