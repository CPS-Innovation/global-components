import { z } from "zod";

export const SettingsSchema = z.object({
  accessibilityBackground: z.boolean().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;
