import { _console } from "./_console";

const expandErrors = (obj: any) => {
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
  } catch (error) {
    _console.error("Tried and failed to expand object", obj);
    return obj;
  }
};

export const withLogging = <T extends (...args: any[]) => any>(fnName: string, fn: T): T => {
  return ((...args: Parameters<T>) => {
    const name = fnName || fn.name || "anonymous";

    try {
      _console.debug(name, "Calling", args);
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.then(
          value => {
            _console.debug(name, "Resolved", expandErrors(value));
            return value;
          },
          error => {
            _console.debug(name, "Rejected", expandErrors(error));
            throw error;
          },
        );
      }

      _console.debug(name, "Returned", expandErrors(result));
      return result;
    } catch (err) {
      _console.error(name, "threw", expandErrors(err));
      throw err;
    }
  }) as T;
};
