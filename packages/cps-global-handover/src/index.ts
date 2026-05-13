// Public surface — exported for testing convenience and (potentially)
// re-use. The browser bundle entry is `auth-handover.ts`, which also exports
// `dispatchHandover` and `getConfig` as named exports for direct test import.
export { dispatchHandover, getConfig, type HandoverConfig } from "./auth-handover";
