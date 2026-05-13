import { z } from "zod";
import { AuthSchema } from "./AuthResult";

// AuthHint = the persisted last-known AD identity. Written to the
// `state/auth-hint` endpoint by the host bundle on successful login, and read
// back by:
// - the host bundle on subsequent loads (warm-start identity)
// - the handover bundle on a redirect-failure beacon (drop 8)
//
// Just wraps the canonical Auth (success-side) with a timestamp.

export const AuthHintSchema = z.object({
  authResult: AuthSchema,
  timestamp: z.number(),
});

export type AuthHint = z.infer<typeof AuthHintSchema>;
