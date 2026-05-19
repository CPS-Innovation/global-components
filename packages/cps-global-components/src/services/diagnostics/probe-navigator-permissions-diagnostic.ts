import { z } from "zod";

export const ProbeNavigatorPermissionsDiagnosticSchema = z.object({
  timestamp: z.number(),
  localNetworkAccessPermission: z.enum(["granted", "denied", "prompt"]).optional(),
});

export type ProbeNavigatorPermissionsDiagnostic = z.infer<typeof ProbeNavigatorPermissionsDiagnosticSchema>;
