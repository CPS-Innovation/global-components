import type { AccountInfo } from "@azure/msal-browser";
import { createMsalInstance } from "./internal/create-msal-instance";
import { handleMsalLogin } from "./handle-msal-login";

// Drop 9 entry point: validate AD auth and either let the user proceed
// silently (no AAD round-trip) or kick off a full-page redirect.
//
// Used by:
// - The shared auth-handover endpoint, on `?stage=ensure-ad&returnTo=…`.
//   External entities (nginx, sibling apps) navigate the user here to
//   guarantee they land at the target with valid AD auth.
// - The OS handover (cookie-return / token-return) paths, which bounce
//   through ensure-ad before letting the user reach the OS app, so the
//   AD check happens here instead of after the OS app has booted.
//
// Behaviour:
// 1. Construct an MSAL PCA and ask for a silent token against the cached
//    account. Success path: navigate to returnTo (same-origin validated).
// 2. No cached account OR silent token rejected: fall through to
//    handleMsalLogin which fires loginRedirect to AAD.
// 3. Iframe context: no-op (acquireTokenSilent in an iframe is a foot-gun;
//    let the parent page drive auth instead).

type MsalConfig = {
  clientId: string;
  authority: string;
};

type SilentMsalLikeInstance = {
  getActiveAccount: () => AccountInfo | null;
  acquireTokenSilent: (request: { scopes: string[] }) => Promise<unknown>;
};

type CreateInstance = (
  config: MsalConfig & { redirectUri: string; replaceOnNavigate?: boolean },
) => Promise<SilentMsalLikeInstance>;

export type HandleMsalEnsureAdOutcome =
  | "iframe-noop"
  | "silent-success"
  | "redirect-initiated"
  | "redirect-initiation-failed";

export const handleMsalEnsureAd = async (
  win: Window,
  msalConfig: MsalConfig,
  returnTo: string | null,
  redirectUri: string,
  // Scopes to ask AAD for. Sourced from config.AD_GATEWAY_SCOPES so the cached
  // token shares an entry with the gateway token-fetch. Empty array → MSAL
  // falls back to OIDC defaults (no access-token cache short-circuit).
  scopes: string[],
  createInstance: CreateInstance = createMsalInstance,
): Promise<HandleMsalEnsureAdOutcome> => {
  if (win.self !== win.top) {
    return "iframe-noop";
  }

  // Try silent first. MSAL uses its internal getActiveAccount() to pick the
  // identity. If there's a valid refresh token, acquireTokenSilent completes
  // via a back-channel POST — no /authorize hop, no iframe, no user-facing
  // flicker. On success we don't navigate here — the caller (mediator) drives
  // all navigation within our estate.
  try {
    const instance = await createInstance({ ...msalConfig, redirectUri });
    // Guard: skip the silent step when there's no active account — acquireTokenSilent
    // would throw no_account_error, which is normal-not-erroneous on a cold cache.
    // Fall straight through to redirect instead.
    if (!instance.getActiveAccount()) {
      console.log(
        "[CPS-GLOBAL-AUTH] handleMsalEnsureAd no active account, falling through to redirect",
      );
    } else {
      try {
        await instance.acquireTokenSilent({ scopes });
        console.log("[CPS-GLOBAL-AUTH] handleMsalEnsureAd silent-success");
        return "silent-success";
      } catch (err) {
        console.log(
          "[CPS-GLOBAL-AUTH] handleMsalEnsureAd silent failed, falling through to redirect",
          err,
        );
        // Fall through to handleMsalLogin below.
      }
    }
  } catch (err) {
    // PCA construction itself failed (rare — config bad). Try the redirect
    // path anyway; it'll surface the same problem in a more user-visible way.
    console.error(
      "[CPS-GLOBAL-AUTH] handleMsalEnsureAd: silent PCA construction threw",
      err,
    );
  }

  const loginOutcome = await handleMsalLogin(
    win,
    msalConfig,
    returnTo,
    redirectUri,
    scopes,
    createInstance as unknown as Parameters<typeof handleMsalLogin>[5],
  );
  if (loginOutcome === "iframe-noop") {
    return "iframe-noop";
  }
  return loginOutcome === "initiated"
    ? "redirect-initiated"
    : "redirect-initiation-failed";
};
