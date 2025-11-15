import { makeConsole } from "./makeConsole";

const expandErrors = (obj: any, _error: (...data: any[]) => void) => {
  try {
    if (obj === undefined) return "undefined";

    return JSON.parse(
      JSON.stringify(obj, (_, value) => {
        if (value instanceof Error) {
          return {
            _error: true,
            message: value.message,
            name: value.name,
          };
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

export const withLogging = <T extends (...args: any[]) => any>(fnName: string, fn: T): T =>
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
