import { emitVerbose } from "./verbose-logging";

const isJest = typeof jest !== "undefined";

const makeMethod =
  (method: "debug" | "error" | "log" | "warn", colour: string, namespace: string = "") =>
  (...data: any[]) => {
    if (isJest) {
      return;
    }
    const style = `background-color: ${colour}; color: white;`;
    // Timestamp taken at call time so a buffered verbose line replays with when
    // it happened, not when the verbose-logging decision was made.
    const timestamp = Date.now();
    const emit = () => console[method](`%c[CPS-GLOBAL-COMPONENTS]`, style, timestamp, namespace, ...data);
    if (method === "debug") {
      emitVerbose(emit);
      return;
    }
    emit();
  };

export const makeConsole = (namespace: string) => ({
  // Only shown when verbose logging is on — see verbose-logging.ts.
  _debug: makeMethod("debug", "lightsteelblue", namespace),
  _log: makeMethod("log", "lightgreen", namespace),
  _error: makeMethod("error", "firebrick", namespace),
  _warn: makeMethod("warn", "goldenrod", namespace),
});
