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
  getAllAccounts: () => AccountInfo[];
  acquireTokenSilent: (request: {
    scopes: string[];
    account: AccountInfo;
  }) => Promise<unknown>;
};

type CreateInstance = (
  config: MsalConfig & { redirectUri: string; replaceOnNavigate?: boolean },
) => Promise<SilentMsalLikeInstance>;

export type HandleMsalEnsureAdOutcome =
  | "iframe-noop"
  | "silent-success"
  | "redirect-initiated"
  | "redirect-initiation-failed";

const loginRequest = { scopes: ["User.Read"] };

export const handleMsalEnsureAd = async (
  win: Window,
  msalConfig: MsalConfig,
  returnTo: string | null,
  redirectUri: string,
  createInstance: CreateInstance = createMsalInstance,
  // Reconciled sid (from the dispatcher's reconcileForCascade call). Threaded
  // straight to the redirect-fallback's loginRedirect so the fallback uses the
  // same sid hint the dispatcher decided on. Undefined when the dispatcher had
  // no incoming sid and no active account to derive one from.
  lastKnownSid?: string,
): Promise<HandleMsalEnsureAdOutcome> => {
  if (win.self !== win.top) {
    return "iframe-noop";
  }

  // Try silent first. If we have a cached account and a valid refresh token,
  // acquireTokenSilent completes via a back-channel POST — no /authorize hop,
  // no iframe, no user-facing flicker. This is the win the OS-handover
  // preemptive check is buying.
  //
  // On success we don't navigate here — the caller (mediator) drives all
  // navigation within our estate. We just signal "silent worked" and let the
  // mediator route the user on to returnTo.
  try {
    const instance = await createInstance({ ...msalConfig, redirectUri });
    const account =
      instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
    if (account) {
      try {
        await instance.acquireTokenSilent({ ...loginRequest, account });
        console.log("[CPS-GLOBAL-AUTH] handleMsalEnsureAd silent-success");
        return "silent-success";
      } catch (err) {
        console.log(
          "[CPS-GLOBAL-AUTH] handleMsalEnsureAd silent failed, falling through to redirect",
          err,
        );
        // Fall through to handleMsalLogin below.
      }
    } else {
      console.log(
        "[CPS-GLOBAL-AUTH] handleMsalEnsureAd no cached account, falling through to redirect",
      );
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
    createInstance as unknown as Parameters<typeof handleMsalLogin>[4],
    lastKnownSid,
  );
  if (loginOutcome === "iframe-noop") {
    return "iframe-noop";
  }
  return loginOutcome === "initiated"
    ? "redirect-initiated"
    : "redirect-initiation-failed";
};
