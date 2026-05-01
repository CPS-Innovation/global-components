import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "./logging";

// Single source of truth for PCA construction. Used by:
// - initialise-ad-auth (host page) to back acquireTokenSilent / ssoSilent / loginRedirect
// - handle-msal-termination (redirect bounce-back page) to back handleRedirectPromise
// Both must agree byte-for-byte on auth/cache/system options so that what one
// instance writes to localStorage the other can read back. Extracted from
// initialise-ad-auth specifically because Drop 4's folded redirect path
// constructs a second instance and the configs were drifting.

const { _debug, _warn, _error } = makeConsole("createMsalInstance");

export const createMsalInstance = async ({
  authority,
  clientId,
  redirectUri,
}: {
  authority: string;
  clientId: string;
  redirectUri: string;
}) => {
  const instance = new PublicClientApplication({
    auth: { authority, clientId, redirectUri },
    cache: {
      // localStorage so tokens persist across the redirect bounce — the page
      // that initiated the redirect is the one that ultimately consumes them.
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

  // FCT2-14290: handleRedirectPromise() was added here historically to clear
  // dirty interaction_in_progress flags left by aborted auth flows. As a guest
  // component on host app pages this picks up and tries to process redirect
  // state from the HOST app's MSAL flows (same tenant, different client ID),
  // causing AADSTS50196 redirect loops. Calling it is therefore deliberate
  // and only happens on the dedicated termination page (handle-msal-termination),
  // never in the host context.

  return instance;
};
