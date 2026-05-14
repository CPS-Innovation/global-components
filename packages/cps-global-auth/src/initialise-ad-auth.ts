import { PublicClientApplication } from "@azure/msal-browser";
import { createMsalInstance } from "./internal/create-msal-instance";
import { AuthResult, KnownErrorType } from "./AuthResult";
import { getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";
import { getTokenFactory } from "./get-token-factory";
import { GetToken } from "./GetToken";
import { LogError } from "./LogError";
import type { SilentFlowDiagnostic } from "./silent-flow-diagnostic";

// Structural shapes — narrow to just the bits we actually read. Lets the auth
// library accept anything satisfying these without depending on the host's
// Config / FoundContext types (which would create a workspace cycle).
type AdAuthConfig = {
  AD_TENANT_AUTHORITY?: string;
  AD_CLIENT_ID?: string;
  SSO_SILENT_DELAY_MS?: number;
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
  addSilentFlowDiagnostics?: (entry: SilentFlowDiagnostic) => void;
  getOperationId?: () => string | undefined;
  // Whether to swap the silent/popup cascade for an acquireTokenSilent →
  // loginRedirect cascade. Resolved by the host's feature-flag layer; the auth
  // library treats it as an opaque on/off and stays agnostic of how it is set.
  useFullPageRedirect?: boolean;
  window: Window;
  // Last-known AAD session id from AuthHint.lastKnownSid. Replayed by the
  // silent step to skip the account picker / re-prompt under a live session.
  lastKnownSid?: string;
};

export type InitialiseAdAuthResult = {
  auth: AuthResult;
  getToken: GetToken;
  // Current AAD session id, extracted from the freshly-acquired account's
  // idTokenClaims.sid. Surfaced so the host can persist it as
  // AuthHint.lastKnownSid for replay on the next ssoSilent / loginRedirect.
  // Absent when the AAD tenant doesn't emit sid, or when auth failed.
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
  },
  context: { msalRedirectUrl: redirectUri, currentHref },
  logError,
  addSilentFlowDiagnostics,
  getOperationId,
  useFullPageRedirect,
  window,
  lastKnownSid,
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
    const { account } = await getAdUserAccount({
      instance,
      config: { SSO_SILENT_DELAY_MS },
      addSilentFlowDiagnostics,
      getOperationId,
      logError,
      useFullPageRedirect,
      window,
      msalRedirectUrl: redirectUri,
      lastKnownSid,
    });
    if (!account) {
      return failedAuth("NoAccountFound", "No AD account found");
    }

    const sid = (account.idTokenClaims as { sid?: string } | undefined)?.sid;
    return {
      auth: {
        isAuthed: true,
        username: account.username.toLowerCase(),
        name: account.name,
        objectId: account.localAccountId,
        groups: (account.idTokenClaims?.["groups"] as string[]) || [],
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
