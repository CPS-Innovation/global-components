// import { state } from "./store";

// export type FeatureFlag<T> =
//   | {
//       wait: true;
//       ready: undefined;
//       broken: undefined;
//     }
//   | {
//       wait: undefined;
//       ready: true;
//       broken: undefined;
//       result: T;
//     }
//   | {
//       wait: undefined;
//       ready: undefined;
//       broken: true;
//       error: Error;
//     };

// const notReady = { wait: true } as FeatureFlag<T>;

// const result = <T>(result: T):FeatureFlag<T> => ({ ready: true, result });

// const readyCheck = (...keys: (keyof typeof state)[]) => {
//   let allReady = true;
//   // It is important that we check all keys and not just so a
//   //  e.g. keys.every(...).  The stencil framework needs to see us
//   //  read every
//   keys.forEach(key => (allReady = allReady && !!key));
//   return allReady ? notReady : undefined;
// };

// export const showRebrand = () => {
//   const check = readyCheck("config");
//   if (check) {
//     return check;
//   }
//   return result(!!state.config.SHOW_GOVUK_REBRAND);
// };

// const r = showRebrand();

// if (r.ready === true) {
//   console.log(r.result)
// }

// export const showMenu = () => {
//   const check = readyCheck("config", "context", "auth");
//   if (check) {
//     return check;
//   }

//   const {
//     config: { SHOW_GOVUK_REBRAND },
//     context: { found },
//   } = state;
// };
