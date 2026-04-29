import { AccountInfo, CacheLookupPolicy, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole, withLogging } from "./internal/logging";
import { getErrorType } from "./get-error-type";
import type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";

type AddSilentFlowDiagnostics = (entry: SilentFlowDiagnostic) => void;

type Props = {
  instance: PublicClientApplication;
  config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined; SSO_SILENT_DELAY_MS: number | undefined };
  addSilentFlowDiagnostics?: AddSilentFlowDiagnostics;
  getOperationId?: () => string | undefined;
  onError?: (error: Error) => void;
};

const asError = (value: unknown): Error => (value instanceof Error ? value : new Error(String(value)));

type AccountSource = "acquireTokenSilent" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const { _debug } = makeConsole("getAdUserAccount");

const DEFAULT_SSO_SILENT_DELAY_MS = 0;

const waitForPageStability = async (ssoSilentDelayMs: number, scriptStartMs: number) => {
  const elapsed = Math.round(performance.now() - scriptStartMs);
  const remainingDelay = Math.max(0, ssoSilentDelayMs - elapsed);
  if (remainingDelay > 0) {
    _debug(`Waiting ${remainingDelay}ms before ssoSilent (${elapsed}ms elapsed since script start, threshold ${ssoSilentDelayMs}ms)`);
    await new Promise(resolve => setTimeout(resolve, remainingDelay));
  }
};

const internalGetAdUserAccount = async ({
  instance,
  config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN, SSO_SILENT_DELAY_MS },
  addSilentFlowDiagnostics,
  getOperationId,
  onError,
}: Props) => {
  const t0 = performance.now();

  const tryAcquireTokenSilently = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!account) return null;

    try {
      const result = await instance.acquireTokenSilent({ ...loginRequest, account, cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken });
      return result.account ? { source: "acquireTokenSilent", account: result.account } : null;
    } catch (error) {
      onError?.(asError(error));
      return null;
    }
  };

  const tryLoginAccountSilently = async (): AccountRetrievalResult => {
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
      return account ? { source: "silent", account } : null;
    } catch (error) {
      const errorType = getErrorType(error);

      const rawErrorCode = (error as { errorCode?: unknown })?.errorCode;
      addSilentFlowDiagnostics?.({
        time: silentFlowStartTime,
        url: window.location.href,
        operationId,
        completedTime: Date.now(),
        outcome: "failure",
        ...(typeof rawErrorCode === "string" && rawErrorCode ? { errorCode: rawErrorCode } : {}),
      });

      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN && errorType === "MultipleIdentities") {
        return null;
      }

      onError?.(asError(error));
      throw error;
    }
  };

  const tryLoginAccountViaPopup = async (): AccountRetrievalResult => {
    try {
      const { account } = await instance.loginPopup(loginRequest);
      return account ? { source: "popup", account } : null;
    } catch (error) {
      onError?.(asError(error));
      throw error;
    }
  };

  const { account, source } = (await tryAcquireTokenSilently()) ||
    (await tryLoginAccountSilently()) ||
    (await tryLoginAccountViaPopup()) || { source: "failed" as AccountSource, account: null };
  instance.setActiveAccount(account);

  _debug("Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
