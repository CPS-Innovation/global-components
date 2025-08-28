import { _console } from "./_console";

export const withLogging = <T extends (...args: any[]) => any>(fn: T, fnName?: string): T => {
  return ((...args: Parameters<T>) => {
    const name = fnName || fn.name || "anonymous";

    const coreArgs = [`Calling ${name}`].concat(args.length ? args : []);

    try {
      const result = fn(...args);

      if (result instanceof Promise) {
        return result.then(
          value => {
            _console.debug(...coreArgs.concat("resolved", value));
            return value;
          },
          error => {
            _console.debug(...coreArgs.concat("rejected with", error));
            throw error;
          },
        );
      }

      _console.debug(...coreArgs.concat("returned", result));
      return result;
    } catch (err) {
      _console.error(...coreArgs.concat("threw", err));
      throw err;
    }
  }) as T;
};
