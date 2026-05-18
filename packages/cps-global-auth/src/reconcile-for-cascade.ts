import { AuthHint, Result } from "cps-global-configuration";
import { createMsalInstance } from "./internal/create-msal-instance";
import {
  reconcileActiveAccountAndSid,
  ReconcileMsalLikeInstance,
} from "./internal/reconcile-active-account-and-sid";

// Convenience wrapper that bundles MSAL instance construction and the
// reconcile call into a single dispatcher-friendly entry point. The handover
// dispatcher uses this BEFORE invoking handleMsalLogin / handleMsalEnsureAd
// so that a single source of truth (the dispatcher) decides which sid to
// hand downstream and aligns active-account state in localStorage to match.
//
// The returned sid is what the caller should pass to its login step:
//   - incoming sid (from authHint)       → that's the working sid
//   - no incoming sid, active account    → active account's snapshotted sid
//   - no incoming sid, no active account → null
//
// Takes the full Result<AuthHint> rather than a bare sid so the caller doesn't
// repeat the {found, result, lastKnownSid} extraction at every call site —
// reconcileForCascade is the canonical "use authHint to align identity" entry.
//
// The MSAL instance constructed here is short-lived and discarded; downstream
// (handleMsalLogin / handleMsalEnsureAd) construct their own. localStorage is
// shared so the active-account mutation carries across.

type MsalConfig = {
  clientId: string;
  authority: string;
};

type CreateInstance = (
  config: MsalConfig & { redirectUri: string },
) => Promise<ReconcileMsalLikeInstance>;

export const reconcileForCascade = async ({
  msalConfig,
  redirectUri,
  authHint,
  createInstance = createMsalInstance,
}: {
  msalConfig: MsalConfig;
  redirectUri: string;
  authHint: Result<AuthHint>;
  createInstance?: CreateInstance;
}): Promise<string | null> => {
  const incomingSid = authHint.found
    ? (authHint.result.lastKnownSid ?? null)
    : null;
  const instance = await createInstance({ ...msalConfig, redirectUri });
  return reconcileActiveAccountAndSid(instance, incomingSid);
};
