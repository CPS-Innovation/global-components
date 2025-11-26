import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

console.log("Registering handlers:", handlers.length, handlers);

export const worker = setupWorker(...handlers);
