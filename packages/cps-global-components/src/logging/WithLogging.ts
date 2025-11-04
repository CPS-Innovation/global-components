import { _console } from "./_console";

export function WithLogging(className: string) {
  return function (_: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    const coreArgs = [`Calling ${propertyKey} on ${className}`];

    descriptor.value = function (...args: any[]) {
      _console.debug(...coreArgs.concat(args.length ? args : []));

      try {
        const result = originalMethod.apply(this, args);
        _console.debug(`Completed ${propertyKey} on ${className}`);
        return result;
      } catch (err) {
        _console.error(...coreArgs.concat(["threw", err]));
        throw err;
      }
    };

    return descriptor;
  };
}
