import { AccountInfo, CacheLookupPolicy, PublicClientApplication } from "@azure/msal-browser";
import { LogError } from "./LogError";
import type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";

type AddSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => void;

type Props = {
  instance: PublicClientApplication;
  config: { SSO_SILENT_DELAY_MS: number | undefined };
  addSilentFlowDiagnostics?: AddSilentFlowDiagnostics;
  getOperationId?: () => string | undefined;
  // Single error delegate from the host. Implementations typically do both
  // console-log AND telemetry tracking (e.g. trackException to App Insights).
  logError: LogError;
  useFullPageRedirect?: boolean;
};

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

// Per-tab sessionStorage key set immediately before loginRedirect fires and
// cleared by handleMsalTermination on a successful bounce-back. If the value
// is present and < this many ms old we refuse to re-fire — protects against
// tight loops if AAD bounces back with an error and acquireTokenSilent fails
// again on the next page load.
export const MSAL_REDIRECT_IN_FLIGHT_KEY = "cps_global_components_msal_redirect_in_flight_at";
export const MSAL_REDIRECT_LOOP_GUARD_MS = 30_000;

type AccountRetrievalResult = Promise<AccountInfo | null>;

const loginRequest = { scopes: ["User.Read"] };

const DEFAULT_SSO_SILENT_DELAY_MS = 0;

const waitForPageStability = async (ssoSilentDelayMs: number, scriptStartMs: number) => {
  const elapsed = Math.round(performance.now() - scriptStartMs);
  const remainingDelay = Math.max(0, ssoSilentDelayMs - elapsed);
  if (remainingDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
};

export const getAdUserAccount = async ({
  instance,
  config: { SSO_SILENT_DELAY_MS },
  addSilentFlowDiagnostics,
  getOperationId,
  logError,
  useFullPageRedirect,
}: Props) => {
  const t0 = performance.now();

  const tryAcquireTokenSilently = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!account) return null;

    try {
      const result = await instance.acquireTokenSilent({ ...loginRequest, account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken });
      return result.account ?? null;
    } catch (error) {
      logError("acquireTokenSilent failed", asError(error));
      return null;
    }
  };

  const tryLoginAccountSilently = async (): AccountRetrievalResult => {
    if (useFullPageRedirect) {
      // Skipped — the redirect path is the active interactive recovery for this caller.
      return null;
    }
    await waitForPageStability(SSO_SILENT_DELAY_MS ?? DEFAULT_SSO_SILENT_DELAY_MS, t0);

    // Pass loginHint to identify the user by UPN rather than by session.
    // Without this, MSAL pulls the active account from cache and extracts
    // its idTokenClaims.sid, sending it as `sid=<value>` on /authorize.
    // If that session has been rotated server-side (by Polaris's own sign-in,
    // CA policy, or session timeout), AD rejects with AADSTS160021.
    // Passing loginHint causes MSAL to skip the account lookup entirely
    // (initializeAuthorizationRequest returns early when loginHint is set),
    // so no sid is ever extracted or sent.
    const knownAccount = instance.getActiveAccount() || instance.getAllAccounts()[0];
    const ssoSilentRequest = { ...loginRequest, ...(knownAccount?.username ? { loginHint: knownAccount.username } : {}) };

    const operationId = getOperationId?.();
    const silentFlowStartTime = Date.now();
    addSilentFlowDiagnostics?.({ time: silentFlowStartTime, url: window.location.href, operationId });
    try {
      const { account } = await instance.ssoSilent(ssoSilentRequest);
      addSilentFlowDiagnostics?.({ time: silentFlowStartTime, url: window.location.href, operationId, completedTime: Date.now(), outcome: "complete" });
      return account ?? null;
    } catch (error) {
      const rawErrorCode = (error as { errorCode?: unknown })?.errorCode;
      addSilentFlowDiagnostics?.({
        time: silentFlowStartTime,
        url: window.location.href,
        operationId,
        completedTime: Date.now(),
        outcome: "failure",
        ...(typeof rawErrorCode === "string" && rawErrorCode ? { errorCode: rawErrorCode } : {}),
      });

      logError("ssoSilent failed", asError(error));
      throw error;
    }
  };

  // Full-page redirect path. Never resolves in the success case — loginRedirect
  // navigates the page away to AAD; this script context dies. The bounce-back
  // lands on the registered redirect URI (the MSAL termination page) where
  // handleMsalTermination calls handleRedirectPromise and then MSAL navigates
  // back to the originating URL via navigateToLoginRequestUrl.
  const tryLoginAccountViaRedirect = async (): AccountRetrievalResult => {
    if (!useFullPageRedirect) {
      // Skipped — the silent path is the active interactive recovery for this caller.
      return null;
    }
    const guardValue = window.sessionStorage.getItem(MSAL_REDIRECT_IN_FLIGHT_KEY);
    if (guardValue && Date.now() - Number(guardValue) < MSAL_REDIRECT_LOOP_GUARD_MS) {
      const error = new Error(
        `MSAL loginRedirect already in-flight (sentinel set ${Date.now() - Number(guardValue)}ms ago); refusing to re-fire to avoid a loop`,
      );
      logError("loginRedirect loop guard tripped", error);
      throw error;
    }
    window.sessionStorage.setItem(MSAL_REDIRECT_IN_FLIGHT_KEY, String(Date.now()));
    try {
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      // Failed to even start the redirect (e.g. interaction_in_progress) —
      // clear the sentinel so the next attempt can run, then surface.
      window.sessionStorage.removeItem(MSAL_REDIRECT_IN_FLIGHT_KEY);
      logError("loginRedirect threw before navigating", asError(error));
      throw error;
    }
    // Unreachable: loginRedirect navigates the page away before its Promise resolves.
    return null;
  };

  // Each step decides internally whether it applies (gated on useFullPageRedirect)
  // and returns null when it doesn't — the cascade stays a flat OR-chain. Order
  // matters: redirect comes before silent so that when redirect fires it owns
  // the page and the silent step is never reached.
  const account =
    (await tryAcquireTokenSilently()) ||
    (await tryLoginAccountViaRedirect()) ||
    (await tryLoginAccountSilently()) ||
    null;
  instance.setActiveAccount(account);

  return account;
};
