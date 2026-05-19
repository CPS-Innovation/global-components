import { z } from "zod";

export const HomeUnitSchema = z.object({
  unitId: z.number().optional(),
  unit: z.string().optional(),
  areaId: z.number().optional(),
  area: z.string().optional(),
  areaGroupId: z.number().nullable().optional(),
  areaGroup: z.string().nullable().optional(),
});

export const AllocatedUnitSchema = z.object({
  areaIsSensitive: z.boolean().optional(),
});

export type AllocatedUnit = z.infer<typeof AllocatedUnitSchema>;

export const UserDataSchema = z.object({
  userId: z.number().optional(),
  selectedCpsAreaId: z.number().optional(),
  hasViewNationalChargingTasksRight: z.boolean().optional(),
  homeUnit: HomeUnitSchema.default({}),
  allocatedUnits: z.array(AllocatedUnitSchema).default([]),
});

// Compact, cookie-friendly representation of what we actually use from UserData.
// Storing the full UserData can exceed the 4KB per-cookie browser limit for users
// with many allocated units (~80+), causing the Set-Cookie to be silently dropped.
export const UserDataHintPayloadSchema = z.object({
  userId: z.number().optional(),
  areaId: z.number().optional(),
  area: z.string().optional(),
  hasViewNationalChargingTasksRight: z.boolean().optional(),
  countSensitiveUnits: z.number(),
  countNotSensitiveUnits: z.number(),
});

export const UserDataHintSchema = z.object({
  timestamp: z.number(),
  userData: UserDataHintPayloadSchema,
});

export type HomeUnit = z.infer<typeof HomeUnitSchema>;
export type UserData = z.infer<typeof UserDataSchema>;
export type UserDataHintPayload = z.infer<typeof UserDataHintPayloadSchema>;
export type UserDataHint = z.infer<typeof UserDataHintSchema>;

export const toUserDataHintPayload = (userData: UserData): UserDataHintPayload => ({
  userId: userData.userId,
  areaId: userData.homeUnit.areaId,
  area: userData.homeUnit.area,
  hasViewNationalChargingTasksRight: userData.hasViewNationalChargingTasksRight,
  countSensitiveUnits: userData.allocatedUnits?.filter(u => u.areaIsSensitive).length ?? 0,
  countNotSensitiveUnits: userData.allocatedUnits?.filter(u => !u.areaIsSensitive).length ?? 0,
});
