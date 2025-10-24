import { _console } from "./_console";

export const withLogging = <T extends (...args: any[]) => any>(fnName: string, fn: T): T => {
  return ((...args: Parameters<T>) => {
    const name = fnName || fn.name || "anonymous";

    try {
      _console.debug(name, "Calling", args);
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.then(
          value => {
            _console.debug(name, "Resolved", value);
            return value;
          },
          error => {
            _console.debug(name, "Rejected", error);
            throw error;
          },
        );
      }

      _console.debug(name, "Returned", result);
      return result;
    } catch (err) {
      _console.error(name, "threw", err);
      throw err;
    }
  }) as T;
};
