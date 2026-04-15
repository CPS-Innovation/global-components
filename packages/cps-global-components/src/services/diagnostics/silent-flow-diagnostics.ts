import { z } from "zod";

export const SilentFlowDiagnosticSchema = z.object({
  time: z.number(),
  url: z.string(),
  operationId: z.string().optional(),
  completedTime: z.number().optional(),
  outcome: z.enum(["complete", "failure"]).optional(),
  errorCode: z.string().optional(),
});

export type SilentFlowDiagnostic = z.infer<typeof SilentFlowDiagnosticSchema>;

export const SilentFlowDiagnosticsSchema = z.object({
  silentFlows: z.array(SilentFlowDiagnosticSchema),
});

export type SilentFlowDiagnostics = z.infer<typeof SilentFlowDiagnosticsSchema>;

export const emptySilentFlowDiagnostics = (): SilentFlowDiagnostics => ({ silentFlows: [] });
