import { NavigationClient, PublicClientApplication } from "@azure/msal-browser";

// MSAL's default NavigationClient uses window.location.assign for external
// navigations (to AAD). For our redirect bundle we want to use replace so the
// auth-flow URLs do not stack up in browser history — hitting back from the
// post-auth host page should not walk the user through the AAD bounce trail.
class ReplaceNavigationClient extends NavigationClient {
  async navigateExternal(url: string): Promise<boolean> {
    window.location.replace(url);
    return true;
  }
}

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
  replaceOnNavigate,
}: {
  authority: string;
  clientId: string;
  redirectUri: string;
  // Use replace instead of assign for MSAL's own external navigation (to AAD).
  // Off by default to preserve existing behaviour for other callers (OS handover
  // relies on the default two-phase MSAL navigation and has its own history
  // expectations). Our login-initiation path turns it on.
  replaceOnNavigate?: boolean;
}) => {
  const instance = new PublicClientApplication({
    auth: { authority, clientId, redirectUri },
    cache: {
      // localStorage so tokens persist across the redirect bounce — the page
      // that initiated the redirect is the one that ultimately consumes them.
      cacheLocation: "localStorage",
    },
    ...(replaceOnNavigate && {
      system: { navigationClient: new ReplaceNavigationClient() },
    }),
  });

  await instance.initialize();
  return instance;
};
