import { createMsalInstance } from "./internal/create-msal-instance";

// Origin-shared MSAL key. Hard-coded rather than imported because @azure/msal-browser
// does not export it; it's defined as `${PREFIX}.${TemporaryCacheKeys.INTERACTION_STATUS_KEY}`
// inside BrowserCacheManager. The value's shape is `{ clientId, type }`.
const MSAL_INTERACTION_STATUS_KEY = "msal.interaction.status";

type MsalConfig = {
  clientId: string;
  authority: string;
};

type MsalLikeInstance = {
  loginRedirect: (request: {
    scopes: string[];
    redirectStartPage?: string;
  }) => Promise<void>;
};

type CreateInstance = (
  config: MsalConfig & { redirectUri: string },
) => Promise<MsalLikeInstance>;

export type HandleMsalLoginOutcome =
  | "iframe-noop"
  | "initiated"
  | "initiation-failed";

const loginRequest = { scopes: ["User.Read"] };

// Same-origin only. Anything else (different origin, unparseable) falls back to
// the root of the redirect page's own origin so we are never an open redirector.
export const resolveReturnTo = (
  returnTo: string | null | undefined,
  redirectPageOrigin: string,
): string => {
  const fallback = `${redirectPageOrigin}/`;
  if (!returnTo) {
    return fallback;
  }
  try {
    const url = new URL(returnTo);
    return url.origin === redirectPageOrigin ? url.href : fallback;
  } catch {
    return fallback;
  }
};

export const handleMsalLogin = async (
  win: Window,
  msalConfig: MsalConfig,
  returnTo: string | null,
  createInstance: CreateInstance = createMsalInstance,
): Promise<HandleMsalLoginOutcome> => {
  if (win.self !== win.top) {
    return "iframe-noop";
  }

  // Defensive clear of MSAL's origin-shared interaction.status. The login page
  // is a dedicated entry point with no host code on it, so any value here is
  // debris: either ours from a previous incomplete flow, or a host app's
  // preparation that their next page load will repopulate. Without this clear,
  // MSAL's loginRedirect preflight throws `interaction_in_progress` on any
  // non-null status (own clientId or foreign — see BrowserCacheManager.mjs).
  win.sessionStorage.removeItem(MSAL_INTERACTION_STATUS_KEY);

  // Clean redirectUri — strip both query and hash. The query carries our own
  // ?action=login&returnTo=… dispatch params which AAD won't preserve through
  // the bounce-back and which would also fail strict AAD URI registration.
  const redirectUri = `${win.location.origin}${win.location.pathname}`;
  const validatedReturnTo = resolveReturnTo(returnTo, win.location.origin);

  try {
    const instance = await createInstance({ ...msalConfig, redirectUri });
    await instance.loginRedirect({
      ...loginRequest,
      redirectStartPage: validatedReturnTo,
    });
    // Unreachable: loginRedirect navigates the page away before its Promise resolves.
    return "initiated";
  } catch (err) {
    console.error(
      "[CPS-GLOBAL-AUTH] handleMsalLogin: loginRedirect threw",
      err,
    );
    return "initiation-failed";
  }
};
