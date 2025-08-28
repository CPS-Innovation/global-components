// import { InternalState } from "./internal-state";

// // Define the input structure type
// export type FeatureFlagDefinition<TReturn> = {
//   dependencies: (keyof InternalState)[];
//   updater: (params: InternalState) => TReturn;
// };

// // Define the FeatureFlag type
// export type FeatureFlag<T> =
//   | {
//       status: "wait";
//     }
//   | {
//       status: "ready";
//       value: T;
//     };

// // Create a mapped type that transforms before to after
// type TransformToFeatureFlags<T> = {
//   [K in keyof T]: T[K] extends { updater: (...args: any[]) => infer R } ? FeatureFlag<R> : never;
// };
// export type FeatureFlags = typeof initialFeatureFlags;

// // Helper function to initialize all feature flags
// export const initializeFeatureFlags = <T extends Record<string, FeatureFlagDefinition<any>>>(config: T): TransformToFeatureFlags<T> => {
//   const result: any = {};

//   for (const key in config) {
//     result[key] = {
//       status: "wait",
//     };
//   }

//   return result;
// };

// const isExperimentalAccessibilityMode: FeatureFlagDefinition<boolean> = {
//   dependencies: ["flags"],
//   updater: ({ flags }: InternalState) => flags.isOverrideMode,
// };

// const shouldShowGovUkRebrand: FeatureFlagDefinition<boolean> = {
//   dependencies: ["config"],
//   updater: ({ config }: InternalState) => !!config.SHOW_GOVUK_REBRAND,
// };

// const shouldShowMenu: FeatureFlagDefinition<boolean> = {
//   dependencies: ["flags", "config", "tags", "auth"],
//   updater: ({ config: { SHOW_MENU, FEATURE_FLAG_ENABLE_MENU_GROUP }, auth }: InternalState) =>
//     !!SHOW_MENU && !!FEATURE_FLAG_ENABLE_MENU_GROUP && auth.isAuthed && auth.groups.includes(FEATURE_FLAG_ENABLE_MENU_GROUP),
// };

// const surveyLink: FeatureFlagDefinition<string | false> = {
//   dependencies: ["config"],
//   updater: ({ config }: InternalState) => config.SURVEY_LINK || false,
// };

// export const featureFlags = {
//   isExperimentalAccessibilityMode,
//   shouldShowGovUkRebrand,
//   shouldShowMenu,
//   surveyLink,
// };

// export const initialFeatureFlags = initializeFeatureFlags(featureFlags);
