// Gate for verbose (`_debug`) console output — RNAV-52.
//
// Verbose logging is on when the bundle itself is served from a local origin
// (someone working on global-components) or when the reader has switched on the
// `verboseLogging` preview flag. A developer working on a HOST app on localhost
// links to the deployed dev script, so the page being on localhost says nothing
// — it is the bundle's origin that tells the two apart.
//
// The preview flag arrives by fetch, after the first log lines have already
// been written. Until the decision is made, verbose calls are buffered and then
// either replayed (in order, with their original timestamps) or dropped. The
// buffer is capped so an initialisation that never reaches a decision can't
// grow it without limit.

type Emit = () => void;

type State = { decision: "pending"; buffer: Emit[] } | { decision: "on" } | { decision: "off" };

export const MAX_BUFFERED_VERBOSE_LOGS = 1000;

let state: State = { decision: "pending", buffer: [] };

export const emitVerbose = (emit: Emit) => {
  if (state.decision === "on") {
    emit();
    return;
  }
  if (state.decision === "pending" && state.buffer.length < MAX_BUFFERED_VERBOSE_LOGS) {
    state.buffer.push(emit);
  }
};

// First decision wins: once on (e.g. a local bundle) a later "off" from a
// preview fetch does not silence it.
export const setVerboseLogging = (enabled: boolean) => {
  if (state.decision !== "pending") {
    return;
  }
  const { buffer } = state;
  state = { decision: enabled ? "on" : "off" };
  if (enabled) {
    buffer.forEach(emit => emit());
  }
};

export const resetVerboseLoggingForTests = () => {
  state = { decision: "pending", buffer: [] };
};
