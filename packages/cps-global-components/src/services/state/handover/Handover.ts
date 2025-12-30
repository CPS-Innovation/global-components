import { CaseDetailsSchema } from "../../data/CaseDetails";
import { MonitoringCodesSchema } from "../../data/MonitoringCode";

import { z } from "zod";

export const HandoverSchema = z.object({
  caseId: z.number(),
  caseDetails: CaseDetailsSchema.optional(),
  monitoringCodes: MonitoringCodesSchema.optional(),
});

export type Handover = z.infer<typeof HandoverSchema>;
