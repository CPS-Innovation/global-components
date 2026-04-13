// Poor-man's DI container. Each `initialise*` service that owns a callable
// attaches it here during startup. Components import `handlers` and invoke the
// callables directly — no CustomEvent marshalling, no store-reactivity gotchas.
//
// Defaults are no-ops so call sites don't need optional-chaining.
// Order of operations: global-script runs initialise* before any component renders,
// so by the time a user interacts with the UI, the real handlers are in place.

export type Handlers = {
  dismissNotification: (id: string) => void;
};

const noop = () => {};

export const handlers: Handlers = {
  dismissNotification: noop,
};
