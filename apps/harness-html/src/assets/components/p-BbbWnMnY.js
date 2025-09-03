import { _ as _console } from './p-D95SeqOK.js';

function WithLogging(className) {
    return function (_, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const coreArgs = [`Calling ${propertyKey} on ${className}`];
        descriptor.value = function (...args) {
            _console.debug(...coreArgs.concat(args.length ? args : []));
            try {
                return originalMethod.apply(this, args);
            }
            catch (err) {
                _console.error(...coreArgs.concat(["threw", err]));
                throw err;
            }
        };
        return descriptor;
    };
}

export { WithLogging as W };
//# sourceMappingURL=p-BbbWnMnY.js.map

//# sourceMappingURL=p-BbbWnMnY.js.map