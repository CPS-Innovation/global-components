import type {
  AccountInfo,
  AuthenticationResult,
  PublicClientApplication,
} from "@azure/msal-browser";
import { Me } from "./AuthResult";
import { getMe } from "./get-me";
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
  setActiveAccount(account: AccountInfo | null): void;
  // Needed so getMe can acquire a Graph token off the freshly-terminated
  // account. The real createMsalInstance returns a PublicClientApplication,
  // which satisfies this; tests inject a fake that stubs it.
  acquireTokenSilent: PublicClientApplication["acquireTokenSilent"];
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
  // AAD session id, extracted from account.idTokenClaims.sid on the "handled"
  // path. Surfaced separately so callers don't have to know the claim name.
  // The handover bundle persists this back to the auth-hint endpoint so the
  // host cascade can replay it as the `sid` hint on the next ssoSilent /
  // loginRedirect — turning subsequent calls into SSO-continuations under the
  // live AAD session (no account-picker, no re-prompt). See
  // [[project_sid_hint_rationale]].
  sid?: string;
  // The user's /me profile slice (department), fetched from Graph off the fresh
  // account. The redirect bounce-back is a genuine AD re-establishment, so this
  // is the right place to refresh it; the handover bakes it into the written-
  // back hint. Undefined when there's no account or the Graph call soft-fails
  // (the host then re-fetches via its own !knownMe branch).
  me?: Me;
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
    const response = await instance.handleRedirectPromise();

    const hasResult = !!response;
    const account = response?.account ?? null;

    if (account) {
      instance.setActiveAccount(account);
    }

    console.log(
      "[CPS-GLOBAL-AUTH] handleMsalTermination handleRedirectPromise resolved",
      { hasResult },
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
    const returnTo =
      win.sessionStorage.getItem(MSAL_REDIRECT_RETURN_TO_KEY) ?? undefined;
    if (returnTo) {
      win.sessionStorage.removeItem(MSAL_REDIRECT_RETURN_TO_KEY);
    }
    const sid = (account?.idTokenClaims as { sid?: string } | undefined)?.sid;
    // Refresh the /me slice off the fresh account — this bounce-back is a
    // genuine AD re-establishment. Non-fatal inside getMe; we just carry
    // whatever it returns (possibly undefined) into the written-back hint.
    const me = account ? await getMe({ instance, account }) : undefined;
    console.log("[CPS-GLOBAL-AUTH] handleMsalTermination complete", {
      hasAccount: !!account,
      hasSid: !!sid,
      hasMe: !!me,
      hasReturnTo: !!returnTo,
    });
    return {
      outcome: "handled",
      account: account,
      sid,
      me,
      returnTo,
    };
  } catch (err) {
    // Drain the returnTo stash and surface it so the caller can navigate the
    // user back to the host page — leaving them stuck on a blank auth-handover
    // page after a failed AAD round-trip is worse than dropping them at the
    // host's FailedAuth UI. The 30s in-flight loop guard (left in place)
    // prevents a tight re-attempt loop from the host on the next page load.
    // See packages/cps-global-handover/AD-FAILURE-MODES.md.
    const returnTo =
      win.sessionStorage.getItem(MSAL_REDIRECT_RETURN_TO_KEY) ?? undefined;
    win.sessionStorage.removeItem(MSAL_REDIRECT_RETURN_TO_KEY);
    console.error(
      "[CPS-GLOBAL-AUTH] handleMsalTermination: handleRedirectPromise threw",
      err,
    );
    return {
      outcome: "handled-with-error",
      returnTo,
    };
  }
};
