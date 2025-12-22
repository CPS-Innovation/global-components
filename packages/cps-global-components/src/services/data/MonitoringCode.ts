import { z } from "zod";

export const MonitoringCodeSchema = z.object({
  code: z.string(),
  description: z.string(),
  type: z.string(),
  disabled: z.boolean(),
  isAssigned: z.boolean(),
});

export type MonitoringCode = z.infer<typeof MonitoringCodeSchema>;

export const MonitoringCodesSchema = z.array(MonitoringCodeSchema);

export type MonitoringCodes = z.infer<typeof MonitoringCodesSchema>;
