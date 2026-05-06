import {
  AccountInfo,
  CacheLookupPolicy,
  PublicClientApplication,
} from "@azure/msal-browser";
import { LogError } from "./LogError";
import type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";
import {
  MSAL_REDIRECT_COMPLETION_ID_KEY,
  MSAL_REDIRECT_IN_FLIGHT_KEY,
  MSAL_REDIRECT_LOOP_GUARD_MS,
} from "./internal/redirect-storage-keys";

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

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

type AccountRetrievalResult = Promise<AccountInfo | null>;

// Four-state outcome derived at the end of the cascade. "redirect-success" /
// "redirect-failure" are inferred from the sessionStorage signals set by the
// termination page (completion id) and by tryLoginAccountViaRedirect itself
// (in-flight sentinel). See internal/redirect-storage-keys.ts.
export type GetAdUserAccountMechanism =
  | "cache"
  | "silent"
  | "redirect-success"
  | "redirect-failure"
  | null;

export type GetAdUserAccountResult = {
  account: AccountInfo | null;
  mechanism: GetAdUserAccountMechanism;
  redirectCompletionId: string | undefined;
};

const loginRequest = { scopes: ["User.Read"] };

const DEFAULT_SSO_SILENT_DELAY_MS = 0;

const waitForPageStability = async (
  ssoSilentDelayMs: number,
  scriptStartMs: number,
) => {
  const elapsed = Math.round(performance.now() - scriptStartMs);
  const remainingDelay = Math.max(0, ssoSilentDelayMs - elapsed);
  if (remainingDelay > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  }
};

export const getAdUserAccount = async ({
  instance,
  config: { SSO_SILENT_DELAY_MS },
  addSilentFlowDiagnostics,
  getOperationId,
  logError,
  useFullPageRedirect,
}: Props): Promise<GetAdUserAccountResult> => {
  const t0 = performance.now();

  // Snapshot the bounce-back signals once at entry. The completion id is a
  // one-shot — we read and clear it immediately so subsequent calls (or tab
  // navigations within the same session) don't see it again. The in-flight
  // sentinel is left in place; tryLoginAccountViaRedirect re-reads it as the
  // loop guard, and we only consult our snapshot for the failure-mechanism
  // derivation at the end.
  const redirectCompletionId =
    window.sessionStorage.getItem(MSAL_REDIRECT_COMPLETION_ID_KEY) ?? undefined;
  if (redirectCompletionId) {
    window.sessionStorage.removeItem(MSAL_REDIRECT_COMPLETION_ID_KEY);
  }
  const inFlightAtEntry = window.sessionStorage.getItem(
    MSAL_REDIRECT_IN_FLIGHT_KEY,
  );
  const wasRedirectInFlightAtEntry =
    !!inFlightAtEntry &&
    Date.now() - Number(inFlightAtEntry) < MSAL_REDIRECT_LOOP_GUARD_MS;

  // Set by whichever cascade step produces an account, used to discriminate
  // "cache" vs "silent" when no completion id is present.
  let producedBy: "cache" | "silent" | undefined;

  const tryAcquireTokenSilently = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount() || instance.getAllAccounts()[0];
    if (!account) return null;

    try {
      const result = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
        cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
      });
      const acquired = result.account ?? null;
      if (acquired) {
        producedBy = "cache";
      }
      return acquired;
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
    await waitForPageStability(
      SSO_SILENT_DELAY_MS ?? DEFAULT_SSO_SILENT_DELAY_MS,
      t0,
    );

    // Pass loginHint to identify the user by UPN rather than by session.
    // Without this, MSAL pulls the active account from cache and extracts
    // its idTokenClaims.sid, sending it as `sid=<value>` on /authorize.
    // If that session has been rotated server-side (by Polaris's own sign-in,
    // CA policy, or session timeout), AD rejects with AADSTS160021.
    // Passing loginHint causes MSAL to skip the account lookup entirely
    // (initializeAuthorizationRequest returns early when loginHint is set),
    // so no sid is ever extracted or sent.
    const knownAccount =
      instance.getActiveAccount() || instance.getAllAccounts()[0];
    const ssoSilentRequest = {
      ...loginRequest,
      ...(knownAccount?.username ? { loginHint: knownAccount.username } : {}),
    };

    const operationId = getOperationId?.();
    const silentFlowStartTime = Date.now();
    addSilentFlowDiagnostics?.({
      time: silentFlowStartTime,
      url: window.location.href,
      operationId,
    });
    try {
      const { account } = await instance.ssoSilent(ssoSilentRequest);
      addSilentFlowDiagnostics?.({
        time: silentFlowStartTime,
        url: window.location.href,
        operationId,
        completedTime: Date.now(),
        outcome: "complete",
      });
      if (account) {
        producedBy = "silent";
      }
      return account ?? null;
    } catch (error) {
      const rawErrorCode = (error as { errorCode?: unknown })?.errorCode;
      addSilentFlowDiagnostics?.({
        time: silentFlowStartTime,
        url: window.location.href,
        operationId,
        completedTime: Date.now(),
        outcome: "failure",
        ...(typeof rawErrorCode === "string" && rawErrorCode
          ? { errorCode: rawErrorCode }
          : {}),
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
    const guardValue = window.sessionStorage.getItem(
      MSAL_REDIRECT_IN_FLIGHT_KEY,
    );
    if (
      guardValue &&
      Date.now() - Number(guardValue) < MSAL_REDIRECT_LOOP_GUARD_MS
    ) {
      const error = new Error(
        `MSAL loginRedirect already in-flight (sentinel set ${Date.now() - Number(guardValue)}ms ago); refusing to re-fire to avoid a loop`,
      );
      logError("loginRedirect loop guard tripped", error);
      throw error;
    }
    window.sessionStorage.setItem(
      MSAL_REDIRECT_IN_FLIGHT_KEY,
      String(Date.now()),
    );
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

  // Mechanism precedence: a present completion id (positive signal from the
  // termination page) wins over the producedBy hint, since either way we want
  // analytics to know "this run sat at the back end of a redirect round-trip".
  // Failure mode: no account AND we either saw the completion id or the
  // in-flight sentinel was live at entry.
  const mechanism: GetAdUserAccountMechanism = account
    ? redirectCompletionId
      ? "redirect-success"
      : (producedBy ?? null)
    : redirectCompletionId || wasRedirectInFlightAtEntry
      ? "redirect-failure"
      : null;

  return { account, mechanism, redirectCompletionId };
};
