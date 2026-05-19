import { z } from "zod";

// Canonical response shape for PUTs against the /state/* endpoints (cookie-
// backed storage). Used by both the host bundle (setAuthHint) and the
// handover bundle (auth-hint write-back after termination). The server
// accepts any JSON body but echoes a uniform success envelope back.

export const StatePutResponseSchema = z.object({
  success: z.boolean(),
  path: z.string(),
  cleared: z.boolean().optional(),
});

export type StatePutResponse = z.infer<typeof StatePutResponseSchema>;
