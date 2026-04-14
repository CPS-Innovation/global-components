import { AccountInfo, CacheLookupPolicy, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";
import type { SilentFlowDiagnostic } from "../diagnostics/silent-flow-diagnostics";

type AddSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => void;

type Props = {
  instance: PublicClientApplication;
  config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined; SSO_SILENT_DELAY_MS: number | undefined };
  diagnosticsCollector?: AdDiagnosticsCollector;
  addSilentFlowDiagnostics?: AddSilentFlowDiagnostics;
};

type AccountSource = "acquireTokenSilent" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const { _debug } = makeConsole("getAdUserAccount");

const DEFAULT_SSO_SILENT_DELAY_MS = 0;

const waitForPageStability = async (ssoSilentDelayMs: number, scriptStartMs: number, diagnosticsCollector?: AdDiagnosticsCollector) => {
  const elapsed = Math.round(performance.now() - scriptStartMs);
  const remainingDelay = Math.max(0, ssoSilentDelayMs - elapsed);
  diagnosticsCollector?.add({
    ssoSilentDelayConfigMs: ssoSilentDelayMs,
    ssoSilentDelayElapsedSinceScriptStartMs: elapsed,
    ssoSilentDelayActualWaitMs: remainingDelay,
  });
  if (remainingDelay > 0) {
    _debug(`Waiting ${remainingDelay}ms before ssoSilent (${elapsed}ms elapsed since script start, threshold ${ssoSilentDelayMs}ms)`);
    await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  }
};

const internalGetAdUserAccount = async ({ instance, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN, SSO_SILENT_DELAY_MS }, diagnosticsCollector, addSilentFlowDiagnostics }: Props) => {
  const t0 = performance.now();

  const tryAcquireTokenSilently = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!account) return null;

    const tAcquire = performance.now();
    try {
      const result = await instance.acquireTokenSilent({ ...loginRequest, account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken });
      diagnosticsCollector?.add({
        acquireTokenSilentStartMs: Math.round(tAcquire),
        acquireTokenSilentDurationMs: Math.round(performance.now() - tAcquire),
        acquireTokenSilentFromCache: result.fromCache,
      });

      return result.account ? { source: "acquireTokenSilent", account: result.account } : null;
    } catch {
      diagnosticsCollector?.add({
        acquireTokenSilentStartMs: Math.round(tAcquire),
        acquireTokenSilentDurationMs: Math.round(performance.now() - tAcquire),
        acquireTokenSilentFailed: true,
      });
      return null;
    }
  };

  const tryLoginAccountSilently = async (): AccountRetrievalResult => {
    await waitForPageStability(SSO_SILENT_DELAY_MS ?? DEFAULT_SSO_SILENT_DELAY_MS, t0, diagnosticsCollector);
    const tSilent = performance.now();
    let pageHiddenDuringAuth = false;
    let beforeUnloadFired = false;

    const onVisibilityChange = () => {
      if (document.hidden) pageHiddenDuringAuth = true;
    };
    const onBeforeUnload = () => {
      beforeUnloadFired = true;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

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

    addSilentFlowDiagnostics?.({ time: Date.now(), url: window.location.href });
    try {
      const { account } = await instance.ssoSilent(ssoSilentRequest);
      diagnosticsCollector?.add({
        ssoSilentStartMs: Math.round(tSilent),
      });
      return account ? { source: "silent", account } : null;
    } catch (error) {
      const errorType = getErrorType(error);

      diagnosticsCollector?.add({
        ssoSilentStartMs: Math.round(tSilent),
        pageHiddenDuringAuth,
        beforeUnloadFired,
        documentHiddenAtFailure: document.hidden,
        visibilityStateAtFailure: document.visibilityState,
        navigatorOnLineAtFailure: navigator.onLine,
        connectionType: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null,
        connectionDownlink: (navigator as unknown as { connection?: { downlink?: number } }).connection?.downlink ?? null,
      });

      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN) {
        if (errorType === "MultipleIdentities") {
          return null;
        }
      }
      throw error;
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  };

  const tryLoginAccountViaPopup = async (): AccountRetrievalResult => {
    diagnosticsCollector?.add({ loginPopupStartMs: Math.round(performance.now()) });
    const { account } = await instance.loginPopup(loginRequest);
    return account ? { source: "popup", account } : null;
  };

  const { account, source } = (await tryAcquireTokenSilently()) || (await tryLoginAccountSilently()) || (await tryLoginAccountViaPopup()) || { source: "failed" as AccountSource, account: null };
  instance.setActiveAccount(account);

  diagnosticsCollector?.add({
    authSource: source,
    authTotalDurationMs: Math.round(performance.now() - t0),
  });

  _debug("Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
