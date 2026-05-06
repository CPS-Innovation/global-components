import { createMsalInstance } from "./internal/create-msal-instance";
import { MSAL_REDIRECT_COMPLETION_ID_KEY, MSAL_REDIRECT_IN_FLIGHT_KEY } from "./internal/redirect-storage-keys";

type MsalConfig = {
  clientId: string;
  authority: string;
};

type MsalLikeInstance = {
  handleRedirectPromise: () => Promise<unknown>;
};

// Async factory — must return an already-initialised instance (consistent with
// createMsalInstance's contract). Tests inject a fake; production uses the
// shared createMsalInstance factory.
type CreateInstance = (config: MsalConfig & { redirectUri: string }) => Promise<MsalLikeInstance>;

export type HandleMsalTerminationOutcome = "iframe-noop" | "handled" | "handled-with-error";

export const handleMsalTermination = async (
  win: Window,
  msalConfig: MsalConfig,
  createInstance: CreateInstance = createMsalInstance,
): Promise<HandleMsalTerminationOutcome> => {
  if (win.self !== win.top) {
    return "iframe-noop";
  }

  try {
    // Preserve query string — strip only the hash. MSAL validates the response's
    // redirectUri against the request's; if the request had `?src=…&stage=…` baked
    // in (folded OS dispatch path) the termination instance must match exactly.
    const redirectUri = win.location.href.split("#")[0]!;
    const instance = await createInstance({ ...msalConfig, redirectUri });
    await instance.handleRedirectPromise();
    // Two synchronous writes before MSAL's window.location.assign navigation
    // (triggered by navigateToLoginRequestUrl: true) pre-empts us:
    //   1. Stamp a fresh UUID under COMPLETION_ID_KEY — get-ad-user-account
    //      reads this on the bounce-back as the positive "redirect succeeded"
    //      signal and uses the value as an analytics correlation token.
    //   2. Clear the in-flight loop guard so the next page load is free to
    //      re-attempt loginRedirect if cached tokens have expired again.
    // Both racing the unload — usually they fire (one microtask before unload),
    // and the 30s loop-guard TTL is the safety net if (2) doesn't.
    win.sessionStorage.setItem(MSAL_REDIRECT_COMPLETION_ID_KEY, win.crypto.randomUUID());
    win.sessionStorage.removeItem(MSAL_REDIRECT_IN_FLIGHT_KEY);
    return "handled";
  } catch (err) {
    console.error("[CPS-GLOBAL-AUTH] handleMsalTermination: handleRedirectPromise threw", err);
    return "handled-with-error";
  }
};
