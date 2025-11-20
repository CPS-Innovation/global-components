import { makeConsole } from "./makeConsole";

export const WithLogging = (className: string) => (_: any, propertyKey: string, descriptor: PropertyDescriptor) => {
  const { _debug, _error } = makeConsole(className);
  const originalMethod = descriptor.value;

  const coreArgs = [`Calling ${propertyKey} on ${className}`];

  descriptor.value = function (...args: any[]) {
    _debug(...coreArgs.concat(args.length ? args : []));

    try {
      const result = originalMethod.apply(this, args);
      _debug(`Completed ${propertyKey} on ${className}`);
      return result;
    } catch (err) {
      _error(...coreArgs.concat(["threw", err]));
      throw err;
    }
  };

  return descriptor;
};
