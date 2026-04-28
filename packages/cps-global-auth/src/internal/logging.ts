// Internal copy of cps-global-components' makeConsole / withLogging.
// Duplicated (rather than imported from cps-global-components) to avoid a
// circular workspace dependency. Behaviour is identical other than the
// "[CPS-GLOBAL-AUTH]" label so log output can be filtered by package.

const isJest = typeof jest !== "undefined";

const makeMethod =
  (method: "debug" | "error" | "log" | "warn", colour: string, namespace: string = "") =>
  (...data: unknown[]) => {
    if (isJest) {
      return;
    }
    const style = `background-color: ${colour}; color: white;`;
    console[method](`%c[CPS-GLOBAL-AUTH]`, style, Date.now(), namespace, ...data);
  };

export const makeConsole = (namespace: string) => ({
  _debug: makeMethod("debug", "lightsteelblue", namespace),
  _log: makeMethod("log", "lightgreen", namespace),
  _error: makeMethod("error", "firebrick", namespace),
  _warn: makeMethod("warn", "goldenrod", namespace),
});

const expandErrors = (obj: unknown, _error: (...data: unknown[]) => void): unknown => {
  try {
    if (obj === undefined) return "undefined";
    return JSON.parse(
      JSON.stringify(obj, (_, value) => {
        if (value instanceof Error) {
          return { _error: true, message: value.message, name: value.name };
        }
        if (value === undefined) return "undefined";
        if (typeof value === "function") return "[Function]";
        if (typeof value === "symbol") return "[Symbol]";
        return value;
      }),
    );
  } catch (err) {
    _error("Tried and failed to expand object", obj, err);
    return obj;
  }
};

export const withLogging = <T extends (...args: never[]) => unknown>(fnName: string, fn: T): T =>
  ((...args: Parameters<T>) => {
    const name = fnName || fn.name || "anonymous";
    const { _debug, _error } = makeConsole(name);

    try {
      _debug(name, "Calling", args);
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.then(
          value => {
            _debug(name, "Resolved", expandErrors(value, _error));
            return value;
          },
          err => {
            _debug(name, "Rejected", expandErrors(err, _error));
            throw err;
          },
        );
      }

      _debug(name, "Returned", expandErrors(result, _error));
      return result;
    } catch (err) {
      _error(name, "threw", expandErrors(err, _error));
      throw err;
    }
  }) as T;
