import { z } from "zod";

export const ProbeIframeLoadDiagnosticSchema = z.object({
  outcome: z.enum(["loaded", "timeout-public", "timeout-local"]),
  durationMs: z.number(),
  timestamp: z.number(),
});

export type ProbeIframeLoadDiagnostic = z.infer<typeof ProbeIframeLoadDiagnosticSchema>;
