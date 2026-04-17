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

export const UserDataHintSchema = z.object({
  timestamp: z.number(),
  userData: UserDataSchema,
});

export type HomeUnit = z.infer<typeof HomeUnitSchema>;
export type UserData = z.infer<typeof UserDataSchema>;
export type UserDataHint = z.infer<typeof UserDataHintSchema>;
