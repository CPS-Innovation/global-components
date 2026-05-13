import type { AccountInfo, AuthenticationResult } from "@azure/msal-browser";
import { createMsalInstance } from "./internal/create-msal-instance";
import {
  MSAL_REDIRECT_COMPLETION_ID_KEY,
  MSAL_REDIRECT_IN_FLIGHT_KEY,
  MSAL_REDIRECT_RETURN_TO_KEY,
} from "./internal/redirect-storage-keys";

type MsalConfig = {
  clientId: string;
  authority: string;
};

type MsalLikeInstance = {
  handleRedirectPromise: () => Promise<AuthenticationResult | null>;
};

// Async factory — must return an already-initialised instance (consistent with
// createMsalInstance's contract). Tests inject a fake; production uses the
// shared createMsalInstance factory.
type CreateInstance = (
  config: MsalConfig & { redirectUri: string },
) => Promise<MsalLikeInstance>;

export type HandleMsalTerminationOutcome =
  | "iframe-noop"
  | "handled"
  | "handled-with-error";

export type HandleMsalTerminationResult = {
  outcome: HandleMsalTerminationOutcome;
  // The MSAL account from the bounce-back response. Populated only on the
  // "handled" path when AAD returned an id_token. Consumers (drop 8 beacon)
  // read idTokenClaims.oid off this for telemetry.
  account?: AccountInfo | null;
  // The post-termination navigation target, drained from sessionStorage on
  // success. Caller is responsible for performing the navigation (via
  // win.location.replace) once any pre-navigation work — e.g. firing the
  // success beacon — has completed. Returning rather than navigating
  // internally lets the caller sequence work without racing the unload.
  returnTo?: string;
};

export const handleMsalTermination = async (
  win: Window,
  msalConfig: MsalConfig,
  createInstance: CreateInstance = createMsalInstance,
): Promise<HandleMsalTerminationResult> => {
  if (win.self !== win.top) {
    console.log("[CPS-GLOBAL-AUTH] handleMsalTermination iframe-noop");
    return { outcome: "iframe-noop" };
  }

  try {
    // Preserve query string — strip only the hash. MSAL validates the response's
    // redirectUri against the request's; if the request had `?src=…&stage=…` baked
    // in (folded OS dispatch path) the termination instance must match exactly.
    const redirectUri = win.location.href.split("#")[0]!;
    const hash = win.location.hash;
    console.log("[CPS-GLOBAL-AUTH] handleMsalTermination start", {
      redirectUri,
      hash,
      hasResponseHash: /[#&](code|error|id_token)=/.test(hash),
      hasReturnToInStorage: !!win.sessionStorage.getItem(
        MSAL_REDIRECT_RETURN_TO_KEY,
      ),
      hasInFlightSentinel: !!win.sessionStorage.getItem(
        MSAL_REDIRECT_IN_FLIGHT_KEY,
      ),
    });
    const instance = await createInstance({ ...msalConfig, redirectUri });
    const result = await instance.handleRedirectPromise();
    console.log(
      "[CPS-GLOBAL-AUTH] handleMsalTermination handleRedirectPromise resolved",
      { hasResult: !!result },
    );
    // Two synchronous writes before any pending navigation pre-empts us:
    //   1. Stamp a fresh UUID under COMPLETION_ID_KEY — get-ad-user-account
    //      reads this on the bounce-back as the positive "redirect succeeded"
    //      signal and uses the value as an analytics correlation token.
    //   2. Clear the in-flight loop guard so the next page load is free to
    //      re-attempt loginRedirect if cached tokens have expired again.
    win.sessionStorage.setItem(
      MSAL_REDIRECT_COMPLETION_ID_KEY,
      win.crypto.randomUUID(),
    );
    win.sessionStorage.removeItem(MSAL_REDIRECT_IN_FLIGHT_KEY);

    // Drain the returnTo stash and surface it to the caller. The caller is
    // responsible for the actual navigation — lets us interleave a beacon
    // call (drop 8) between termination and unload without racing.
    const returnTo = win.sessionStorage.getItem(MSAL_REDIRECT_RETURN_TO_KEY);
    if (returnTo) {
      win.sessionStorage.removeItem(MSAL_REDIRECT_RETURN_TO_KEY);
    }
    console.log("[CPS-GLOBAL-AUTH] handleMsalTermination complete", {
      hasAccount: !!result?.account,
      hasReturnTo: !!returnTo,
    });
    return {
      outcome: "handled",
      account: result?.account ?? null,
      returnTo: returnTo ?? undefined,
    };
  } catch (err) {
    // Clear the returnTo stash if present — flow is over and we don't want
    // the next handleMsalTermination (different flow) to navigate stale.
    // Leave the in-flight sentinel in place so get-ad-user-account on the
    // next host-page entry can infer "redirect-failure".
    win.sessionStorage.removeItem(MSAL_REDIRECT_RETURN_TO_KEY);
    console.error(
      "[CPS-GLOBAL-AUTH] handleMsalTermination: handleRedirectPromise threw",
      err,
    );
    return { outcome: "handled-with-error" };
  }
};
