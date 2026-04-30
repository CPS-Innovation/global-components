import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole, withLogging } from "./internal/logging";
import { AuthResult, FailedAuth, KnownErrorType } from "./AuthResult";
import { getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";
import { getTokenFactory } from "./get-token-factory";
import { GetToken } from "./GetToken";
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
  onError?: (error: Error) => void;
  addSilentFlowDiagnostics?: (entry: SilentFlowDiagnostic) => void;
  getOperationId?: () => string | undefined;
  // Whether to swap the silent/popup cascade for an acquireTokenSilent →
  // loginRedirect cascade. Resolved by the host's feature-flag layer; the auth
  // library treats it as an opaque on/off and stays agnostic of how it is set.
  useFullPageRedirect?: boolean;
};

const failedAuth = (knownErrorType: KnownErrorType, reason: string): { auth: FailedAuth; getToken: GetToken } => ({
  auth: { isAuthed: false, knownErrorType, reason },
  getToken: () => Promise.resolve(null),
});

const { _debug, _warn, _error } = makeConsole("initialiseAdAuth");

// Private — kept inside this module so consumers don't need to know about
// PublicClientApplication or @azure/msal-browser.
const createMsalInstance = async ({ authority, clientId, redirectUri }: { authority: string; clientId: string; redirectUri: string }) => {
  const instance = new PublicClientApplication({
    auth: { authority, clientId, redirectUri },
    cache: {
      // Note: no strong reason for choosing localStorage other than we are in a world
      //  where we are skipping around different apps, and possibly different tabs.
      cacheLocation: "localStorage",
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          const logFn = level === LogLevel.Error ? _error : level === LogLevel.Warning ? _warn : _debug;
          logFn("MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

  await instance.initialize();

  // FCT2-14290: handleRedirectPromise() was added here to clear dirty interaction_in_progress
  //  flags left by aborted auth flows. However, as a guest component on host app pages, this
  //  picks up and tries to process redirect state from the HOST APP's own MSAL flows (same
  //  tenant, different client ID), causing AADSTS50196 redirect loops. Needs guards to check
  //  that any pending redirect state belongs to our client ID before calling. Parked for now.

  return instance;
};

// Module-level: the MSAL instance is created lazily on the first call and reused
// across subsequent calls so MSAL's internal token/account cache persists. The
// module is loaded once per page (initialiseAuth's caller is guarded by
// `window.cps_global_components_initialised`), so this is effectively a singleton
// scoped to the page.
let instance: PublicClientApplication | undefined;

const initialiseAdAuthInternal = async ({
  config: { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, SSO_SILENT_DELAY_MS },
  context: { msalRedirectUrl: redirectUri, currentHref },
  onError,
  addSilentFlowDiagnostics,
  getOperationId,
  useFullPageRedirect,
}: Props): Promise<{ auth: AuthResult; getToken: GetToken }> => {
  if (!(authority && clientId && redirectUri && currentHref)) {
    return failedAuth("ConfigurationIncomplete", `Found configuration is: ${JSON.stringify({ authority, clientId, redirectUri, currentHref })}`);
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (currentHref.startsWith(redirectUri.toLowerCase())) {
    return failedAuth("RedirectLocationIsApp", "We think we are the MSAL AD redirectUri loading and hence not a real application");
  }

  if (!instance) {
    instance = await createMsalInstance({ authority, clientId, redirectUri });
  }

  try {
    const account = await getAdUserAccount({
      instance,
      config: { SSO_SILENT_DELAY_MS },
      addSilentFlowDiagnostics,
      getOperationId,
      onError,
      useFullPageRedirect,
    });
    if (!account) {
      return failedAuth("NoAccountFound", "No AD account found");
    }

    return {
      auth: {
        isAuthed: true,
        username: account.username.toLowerCase(),
        name: account.name,
        objectId: account.localAccountId,
        groups: (account.idTokenClaims?.["groups"] as string[]) || [],
      },
      getToken: getTokenFactory({ instance }),
    };
  } catch (error) {
    const errorType = getErrorType(error);
    _error({ errorType, authority, clientId, redirectUri, error });
    return failedAuth(errorType, `${error}`);
  }
};

export const initialiseAdAuth = withLogging("initialiseAdAuth", initialiseAdAuthInternal);
