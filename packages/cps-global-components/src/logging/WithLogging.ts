import { _console } from "./_console";

export function WithLogging(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value;

  const isStatic = target.constructor === Function;
  const className = isStatic ? target.name : target.constructor.name;

  const coreArgs = [`Calling ${propertyKey} on ${className}`];

  descriptor.value = function (...args: any[]) {
    _console.debug(...coreArgs.concat(args.length ? args : []));

    try {
      return originalMethod.apply(this, args);
    } catch (err) {
      _console.error(...coreArgs.concat(["threw", err]));
      throw err;
    }
  };

  return descriptor;
}
