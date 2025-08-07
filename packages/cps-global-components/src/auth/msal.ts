import { PublicClientApplication } from "@azure/msal-browser";
import { Config } from "cps-global-configuration";
import { findContext } from "../config/context/find-context";

let cachedPromise: ReturnType<typeof internal> = undefined;

type ExternalParams = Pick<Config, "AD_CLIENT_ID" | "AD_TENANT_AUTHORITY" | "CONTEXTS">;

type InternalParams = {
  authority: string;
  clientId: string;
  redirectUri: string;
};

type Result =
  | {
      isAuthed: false;
      username?: never;
      name?: undefined;
      getToken?: undefined;
      error?: any;
    }
  | {
      isAuthed: true;
      username: string;
      name: string;
      getToken: () => Promise<string>;
      error?: undefined;
    };

const scopes = ["User.Read"];

const internal = async ({ authority, clientId, redirectUri }: InternalParams): Promise<Result> => {
  const instance = new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
    },
  });

  try {
    await instance.initialize();
    await instance.ssoSilent({
      scopes,
    });

    const accounts = instance.getAllAccounts();

    if (!accounts.length) {
      return { isAuthed: false };
    }
    instance.setActiveAccount(accounts[0]);
    const { username, name } = instance.getActiveAccount();

    return {
      isAuthed: true,
      username: username.toLowerCase(),
      name,
      getToken: async () => {
        const { accessToken } = await instance.acquireTokenSilent({
          scopes,
        });
        return accessToken;
      },
    };
  } catch (error) {
    return { isAuthed: false, error };
  }
};

export const initialiseMsal = async (window: Window & typeof globalThis, { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, CONTEXTS }: ExternalParams) => {
  const { msalRedirectUrl: redirectUri } = findContext(CONTEXTS, window);

  if (!(authority && clientId && redirectUri)) {
    // todo: feedback or logging
    cachedPromise = Promise.resolve({ isAuthed: false, error: new Error(`Missing one or more of ${{ authority, clientId, redirectUri }}`) });
    return;
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (window.location.href.toLowerCase().startsWith(redirectUri.toLowerCase())) {
    // todo: feedback or logging
    cachedPromise = Promise.resolve({ isAuthed: false, error: new Error(`We think we are the MSAL AD redirectUri loading and hence not a real application`) });
    return;
  }
  cachedPromise = internal({ authority, clientId, redirectUri });
};

export const msal = () => cachedPromise;
