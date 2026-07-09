import { z } from "zod";
import { AuthSchema } from "./AuthResult";

// AuthHint = the persisted last-known AD identity. Written to the
// `state/auth-hint` endpoint by the host bundle on successful login, and read
// back by:
// - the host bundle on subsequent loads (warm-start identity)
// - the handover bundle on a redirect-failure beacon (drop 8)
// - the host cascade (drop 10) — `lastKnownSid` is replayed as the `sid`
//   parameter on ssoSilent / loginRedirect / loginPopup so AAD treats the
//   call as an SSO-continuation under the live session (skip account-picker,
//   skip re-prompt) until the session naturally expires.
//
// Wraps the canonical Auth (success-side) with a timestamp and the optional
// last-known session id.

export const AuthHintSchema = z.object({
  authResult: AuthSchema,
  timestamp: z.number(),
  lastKnownSid: z.string().optional(),
});

export type AuthHint = z.infer<typeof AuthHintSchema>;
