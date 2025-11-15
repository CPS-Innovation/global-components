const isJest = typeof jest !== "undefined";

const makeMethod =
  (method: "debug" | "error" | "log" | "warn", colour: string, namespace: string = "") =>
  (...data: any[]) => {
    if (isJest) {
      return;
    }
    const style = `background-color: ${colour}; color: white;`;
    console[method](`%c[CPS-GLOBAL-COMPONENTS]`, style, Date.now(), namespace, ...data);
  };

export const makeConsole = (namespace: string) => ({
  _debug: makeMethod("debug", "lightsteelblue", namespace),
  _log: makeMethod("log", "lightgreen", namespace),
  _error: makeMethod("error", "firebrick", namespace),
  _warn: makeMethod("warn", "goldenrod", namespace),
});
