import { PrivateTagProperties, State, Store } from "./store";

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

export type ReadyStateHelper = ReturnType<typeof readyStateFactory>;

export const readyStateFactory =
  (store: Store) =>
  <K extends readonly (keyof StateWithoutPrivateTags)[] = readonly []>(
    ...keys: K
  ): { isReady: true; state: PickIfReadyReturn<K> & Pick<StateWithoutPrivateTags, "fatalInitialisationError"> } | { isReady: false; state: StateWithoutPrivateTags } => {
    const alwaysReturnedState = { fatalInitialisationError: store.state.fatalInitialisationError };

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
