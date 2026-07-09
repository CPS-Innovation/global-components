import { PublicClientApplication } from "@azure/msal-browser";
import { createMsalInstance } from "./internal/create-msal-instance";
import { AuthResult, KnownErrorType, Me } from "./AuthResult";
import { getAdUserAccount } from "./get-ad-user-account";
import { getMe } from "./get-me";
import { getErrorType } from "./get-error-type";
import { getTokenFactory } from "./get-token-factory";
import { GetToken } from "./GetToken";
import { LogError } from "./LogError";

// Structural shapes — narrow to just the bits we actually read. Lets the auth
// library accept anything satisfying these without depending on the host's
// Config / FoundContext types (which would create a workspace cycle).
type AdAuthConfig = {
  AD_TENANT_AUTHORITY?: string;
  AD_CLIENT_ID?: string;
  SSO_SILENT_DELAY_MS?: number;
  // Scopes used on every MSAL call (silent, redirect, gateway token). Always
  // an array; the schema defaults to [] when not configured.
  AD_GATEWAY_SCOPES: string[];
};

type AdAuthContext = {
  msalRedirectUrl?: string;
  currentHref?: string;
};

type Props = {
  config: AdAuthConfig;
  context: AdAuthContext;
  // Single error delegate from the host. Implementations typically do both
  // console-log AND telemetry tracking (e.g. trackException to App Insights).
  // The library hands every error it surfaces through this one hook.
  logError: LogError;
  // Whether to swap the silent/popup cascade for an acquireTokenSilent →
  // loginRedirect cascade. Resolved by the host's feature-flag layer; the auth
  // library treats it as an opaque on/off and stays agnostic of how it is set.
  useFullPageRedirect?: boolean;
  // The last-known /me profile slice, replayed from the host's AuthHint. When
  // present we skip the Graph /me call entirely (warm path); when absent (cold
  // establishment, ~once a day) we fetch it. Graph never caches the /me
  // response, so this is the only thing that keeps us off Graph on every load.
  knownMe?: Me;
  window: Window;
};

export type InitialiseAdAuthResult = {
  auth: AuthResult;
  getToken: GetToken;
  // Current AAD session id, extracted from the freshly-acquired account's
  // idTokenClaims.sid. Surfaced so the host can persist it as
  // AuthHint.lastKnownSid. The hint is currently in deep-freeze (not read for
  // MSAL hint plumbing) but kept fresh in state so we can reactivate use of
  // it without a backfill if needed.
  lastKnownSid?: string;
};

const failedAuth = (
  knownErrorType: KnownErrorType,
  reason: string,
): InitialiseAdAuthResult => ({
  auth: { isAuthed: false, knownErrorType, reason },
  getToken: () => Promise.resolve(null),
});

// Module-level: the MSAL instance is created lazily on the first call and reused
// across subsequent calls so MSAL's internal token/account cache persists. The
// module is loaded once per page (initialiseAuth's caller is guarded by
// `window.cps_global_components_initialised`), so this is effectively a singleton
// scoped to the page.
let instance: PublicClientApplication | undefined;

export const initialiseAdAuth = async ({
  config: {
    AD_TENANT_AUTHORITY: authority,
    AD_CLIENT_ID: clientId,
    SSO_SILENT_DELAY_MS,
    AD_GATEWAY_SCOPES,
  },
  context: { msalRedirectUrl: redirectUri, currentHref },
  logError,
  useFullPageRedirect,
  knownMe,
  window,
}: Props): Promise<InitialiseAdAuthResult> => {
  if (!(authority && clientId && redirectUri && currentHref)) {
    return failedAuth(
      "ConfigurationIncomplete",
      `Found configuration is: ${JSON.stringify({ authority, clientId, redirectUri, currentHref })}`,
    );
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (currentHref.startsWith(redirectUri.toLowerCase())) {
    return failedAuth(
      "RedirectLocationIsApp",
      "We think we are the MSAL AD redirectUri loading and hence not a real application",
    );
  }

  if (!instance) {
    instance = await createMsalInstance({ authority, clientId, redirectUri });
  }

  try {
    const { account, mechanism } = await getAdUserAccount({
      instance,
      config: { SSO_SILENT_DELAY_MS },
      logError,
      useFullPageRedirect,
      window,
      msalRedirectUrl: redirectUri,
      scopes: AD_GATEWAY_SCOPES,
    });
    if (!account) {
      // Distinguish the outbound leg of a redirect (transient — page about to
      // unload, next load will resolve via the bounce-back) from a true
      // terminal failure. Without this, analytics conflates the two and every
      // redirect initiation reads as a failed auth.
      return mechanism === "redirect-initiated"
        ? failedAuth(
            "RedirectInFlight",
            "loginRedirect fired; page about to unload",
          )
        : failedAuth("NoAccountFound", "No AD account found");
    }

    const sid = (account.idTokenClaims as { sid?: string } | undefined)?.sid;
    // Establish the /me slice here, alongside the account — not as a lazy
    // callable like getToken (which is lazy only because a token refresh may be
    // needed at call time). department is a fixed attribute, refreshed only on a
    // genuine AD re-establishment: mechanism "silent" (ssoSilent — fires when
    // the ~daily SPA refresh token has expired and AAD re-issues a fresh
    // id_token). A "cache" mechanism (cached access token OR the routine ~hourly
    // refresh-token→access-token exchange) reuses knownMe and never hits Graph.
    // redirect-success likewise rides the hint — the handover refreshed /me on
    // the bounce-back. `!knownMe` covers the very first load with nothing cached.
    // On a failed refetch we keep the stale knownMe rather than dropping it.
    const me =
      mechanism === "silent" || !knownMe
        ? ((await getMe({ instance, account, logError })) ?? knownMe)
        : knownMe;
    return {
      auth: {
        isAuthed: true,
        username: account.username.toLowerCase(),
        name: account.name,
        objectId: account.localAccountId,
        groups: (account.idTokenClaims?.["groups"] as string[]) || [],
        ...(me ? { me } : {}),
      },
      getToken: getTokenFactory({ instance, logError }),
      ...(sid ? { lastKnownSid: sid } : {}),
    };
  } catch (error) {
    const errorType = getErrorType(error);
    logError("initialiseAdAuth failed", {
      errorType,
      authority,
      clientId,
      redirectUri,
      error,
    });
    return failedAuth(errorType, `${error}`);
  }
};
