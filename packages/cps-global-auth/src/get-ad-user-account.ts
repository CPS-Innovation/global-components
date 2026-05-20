import {
  AccountInfo,
  CacheLookupPolicy,
  PublicClientApplication,
} from "@azure/msal-browser";
import { HANDOVER_PARAM_KEYS } from "cps-global-configuration";
import { LogError } from "./LogError";
import {
  MSAL_REDIRECT_COMPLETION_ID_KEY,
  MSAL_REDIRECT_IN_FLIGHT_KEY,
  MSAL_REDIRECT_LOOP_GUARD_MS,
} from "./internal/redirect-storage-keys";

type Props = {
  instance: PublicClientApplication;
  config: { SSO_SILENT_DELAY_MS: number | undefined };
  // Single error delegate from the host. Implementations typically do both
  // console-log AND telemetry tracking (e.g. trackException to App Insights).
  logError: LogError;
  useFullPageRedirect?: boolean;
  window: Window;
  // URL of the auth-handover.html endpoint (cps-global-handover). When
  // useFullPageRedirect is true, the redirect path hands off to this URL with
  // ?stage=ad-redirect rather than calling instance.loginRedirect() here —
  // keeps our MSAL calls strictly on the host-code-free page so we never
  // write msal.interaction.status into a sessionStorage shared with the host.
  msalRedirectUrl: string;
  // Scopes to ask AAD for on both the cache step and the ssoSilent step.
  // Sourced from config.AD_GATEWAY_SCOPES so the login cascade and the gateway
  // token-fetch share a cache entry. Empty array means "OIDC defaults only"
  // (cascade still works, just loses the access-token cache short-circuit).
  scopes: string[];
};

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

type AccountRetrievalResult = Promise<AccountInfo | null>;

// Five-state outcome derived at the end of the cascade. "redirect-success" /
// "redirect-failure" / "redirect-initiated" are inferred from the
// sessionStorage signals set by the termination page (completion id) and by
// tryLoginAccountViaRedirect itself (in-flight sentinel + the local
// redirectInitiatedThisCall flag). See internal/redirect-storage-keys.ts.
//
// "redirect-initiated" specifically means: this call fired loginRedirect and is
// about to unload the page. Distinct from "redirect-failure" (which means a
// PRIOR redirect didn't complete successfully) — surfacing the two separately
// stops analytics treating the outbound leg of a healthy redirect as a failure.
export type GetAdUserAccountMechanism =
  | "cache"
  | "silent"
  | "redirect-success"
  | "redirect-failure"
  | "redirect-initiated"
  | null;

export type GetAdUserAccountResult = {
  account: AccountInfo | null;
  mechanism: GetAdUserAccountMechanism;
  redirectCompletionId: string | undefined;
};

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
  logError,
  useFullPageRedirect,
  window,
  msalRedirectUrl,
  scopes,
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

  // Set by tryLoginAccountViaRedirect just before window.location.replace().
  // Drives the "redirect-initiated" mechanism reported back to the caller so
  // analytics can distinguish the outbound leg of a redirect (transient, page
  // about to unload) from a real "no account found" terminal failure.
  let redirectInitiatedThisCall = false;

  const tryAcquireTokenSilently = async (): AccountRetrievalResult => {
    // Active account is the contract: ssoSilent success and handleMsalTermination
    // both call setActiveAccount on the freshly-authenticated account. If active
    // is null here, we deliberately don't fall back to getAllAccounts()[0] —
    // that path was a multi-account bleed risk (picking insertion-order [0] when
    // the user might be expecting a different cached identity). Return null and
    // let the cascade fall through to ssoSilent / redirect, where AAD becomes
    // the authoritative source of identity.
    const account = instance.getActiveAccount();
    if (!account) return null;

    try {
      const result = await instance.acquireTokenSilent({
        scopes,
        account,
        cacheLookupPolicy: CacheLookupPolicy.AccessTokenAndRefreshToken,
      });
      const acquired = result.account ?? null;
      if (acquired) {
        producedBy = "cache";
        // Belt-and-braces: lock the invariant in even though MSAL was already
        // using this account. Cheap, defends against MSAL's internal active
        // state getting cleared by an unrelated codepath.
        instance.setActiveAccount(acquired);
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

    // No hints in the request — let MSAL/AAD do their default thing. MSAL
    // auto-extracts a hint from the active account's claims (login_hint claim
    // preferred, sid claim next, username last) when an active is set; with no
    // active, AAD identifies the user via the browser session cookie alone.
    try {
      const { account } = await instance.ssoSilent({ scopes });
      if (account) {
        producedBy = "silent";
        instance.setActiveAccount(account);
      }
      return account ?? null;
    } catch (error) {
      logError("ssoSilent failed", asError(error));
      throw error;
    }
  };

  // Full-page redirect path. Never resolves in the success case — the assign
  // navigates the page away to the dedicated msal-redirect.html, which itself
  // navigates to AAD; this script context dies. The bounce-back lands on
  // msal-redirect.html (now with a response hash), where handleMsalTermination
  // calls handleRedirectPromise and then MSAL navigates back to the originating
  // URL we encoded as ?returnTo=.
  //
  // We deliberately do NOT call instance.loginRedirect() here. That would
  // write MSAL state (msal.interaction.status, request.params, code.verifier)
  // into a sessionStorage shared with the host app. If our navigation lost a
  // race to the host app's own loginRedirect, our debris would jam the host
  // app's MSAL preflight on the bounce-back (see FCT2-17451). Doing the assign
  // bare leaves zero MSAL state on the host page in the lost-race case.
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
      // msalRedirectUrl from config already bakes in ?src= and &stage=ad-redirect
      // (silent SSO and full-page redirect must hit the same AAD-registered URI,
      // so we don't add the stage here). Just append our own returnTo dispatch
      // param for the bundle to consume on the bounce-back.
      const target = new URL(msalRedirectUrl);
      target.searchParams.set(
        HANDOVER_PARAM_KEYS.RETURN_TO,
        window.location.href,
      );
      // Mark the redirect as initiated BEFORE replace() so the cascade's
      // deriveMechanism reports "redirect-initiated" rather than null on the
      // brief window of script execution before the page actually unloads.
      // If URL construction above had thrown, we'd never reach this and the
      // catch below would clear the in-flight sentinel.
      redirectInitiatedThisCall = true;
      // replace, not assign — we don't want the host page entry preserved in
      // history under the auth-handover.html?stage=ad-redirect entry. Hitting
      // back through the auth flow would either re-fire loginRedirect or land
      // the user on a blank auth-handover.html. Treat the bounce as plumbing.
      window.location.replace(target.href);
    } catch (error) {
      // assign normally cannot throw, but if URL construction fails or the
      // navigation is somehow rejected, clear the sentinel so the next attempt
      // can run, then surface.
      window.sessionStorage.removeItem(MSAL_REDIRECT_IN_FLIGHT_KEY);
      logError("redirect hand-off threw before navigating", asError(error));
      throw error;
    }
    // Unreachable in production: the assign above navigates the page away
    // before the next microtask runs.
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

  // Mechanism precedence: a present completion id (positive signal from the
  // termination page) wins over the producedBy hint, since either way we want
  // analytics to know "this run sat at the back end of a redirect round-trip".
  // For the account-null branch, "redirect-initiated" (the cascade fired the
  // redirect this call) takes priority over "redirect-failure" (a prior
  // redirect didn't complete) — they are mutually exclusive in practice anyway
  // because the loop guard prevents re-firing while the sentinel is live.
  const deriveMechanism = (): GetAdUserAccountMechanism => {
    if (account && redirectCompletionId) {
      return "redirect-success";
    }
    if (account) {
      return producedBy ?? null;
    }
    if (redirectInitiatedThisCall) {
      return "redirect-initiated";
    }
    if (redirectCompletionId || wasRedirectInFlightAtEntry) {
      return "redirect-failure";
    }
    return null;
  };
  const mechanism = deriveMechanism();

  return { account, mechanism, redirectCompletionId };
};
