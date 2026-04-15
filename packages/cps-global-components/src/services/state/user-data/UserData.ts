import { z } from "zod";

export const HomeUnitSchema = z.object({
  unitId: z.number(),
  unit: z.string(),
  areaId: z.number(),
  area: z.string(),
  areaIsSensitive: z.boolean(),
  areaGroupId: z.number(),
  areaGroup: z.string(),
});

export const UserDataSchema = z.object({
  userId: z.number(),
  selectedCpsAreaId: z.number(),
  homeUnit: HomeUnitSchema,
});

export const UserDataHintSchema = z.object({
  timestamp: z.number(),
  userData: UserDataSchema,
});

export type HomeUnit = z.infer<typeof HomeUnitSchema>;
export type UserData = z.infer<typeof UserDataSchema>;
export type UserDataHint = z.infer<typeof UserDataHintSchema>;
