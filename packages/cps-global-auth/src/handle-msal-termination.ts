import { makeConsole } from "./internal/logging";
import { createMsalInstance } from "./internal/create-msal-instance";

const { _debug, _error } = makeConsole("handleMsalTermination");

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
    _debug("running inside iframe — no-op");
    return "iframe-noop";
  }

  try {
    // Preserve query string — strip only the hash. MSAL validates the response's
    // redirectUri against the request's; if the request had `?src=…&stage=…` baked
    // in (folded OS dispatch path) the termination instance must match exactly.
    const redirectUri = win.location.href.split("#")[0]!;
    const instance = await createInstance({ ...msalConfig, redirectUri });
    await instance.handleRedirectPromise();
    // Clear the per-tab loop guard set by tryLoginAccountViaRedirect — the
    // round-trip completed successfully and the next page load is free to
    // re-attempt loginRedirect if cached tokens have expired again.
    win.sessionStorage.removeItem("cps_global_components_msal_redirect_in_flight_at");
    return "handled";
  } catch (err) {
    _error("handleRedirectPromise threw", err);
    return "handled-with-error";
  }
};
