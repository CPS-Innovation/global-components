import { z } from "zod";

export const SettingsSchema = z.object({
  // Tone of the bespoke low-contrast surface; undefined = feature off.
  // Legacy "light-grey" (the original single mode) is coerced to "soft-grey" so
  // existing opted-in users — whose choice persists in a 365-day cookie — keep the feature.
  accessibilityBackground: z
    .preprocess(v => (v === "light-grey" ? "soft-grey" : v), z.enum(["soft-grey", "warm"]))
    .optional(),
  preventUrnPrependInTabTitle: z.boolean().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
