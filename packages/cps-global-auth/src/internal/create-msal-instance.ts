import { PublicClientApplication } from "@azure/msal-browser";

// Single source of truth for PCA construction. Used by:
// - initialise-ad-auth (host page) to back acquireTokenSilent / ssoSilent / loginRedirect
// - handle-msal-termination (redirect bounce-back page) to back handleRedirectPromise
// Both must agree byte-for-byte on auth/cache options so that what one
// instance writes to localStorage the other can read back.
//
// FCT2-14290: handleRedirectPromise() was historically called here to clear
// dirty interaction_in_progress flags. As a guest component on host app pages
// it picks up the HOST app's MSAL redirect state (same tenant, different
// client ID), causing AADSTS50196 redirect loops. It is therefore only ever
// called from handle-msal-termination, never from the host context.

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
  });

  await instance.initialize();
  return instance;
};
