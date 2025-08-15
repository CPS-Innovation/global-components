import { PublicClientApplication } from "@azure/msal-browser";
import { Config } from "cps-global-configuration";
import { findContext } from "../config/context/find-context";

export type Auth = {
  isAuthed: true;
  username: string;
  name: string;
  groups: string[];
};

export type FailedAuth = {
  isAuthed: false;
  reason: string;
};

export type AuthResult = Auth | FailedAuth;

const scopes = ["User.Read"];

export const initialiseAuth = async (window: Window & typeof globalThis, { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, CONTEXTS }: Config): Promise<AuthResult> => {
  const { msalRedirectUrl: redirectUri } = findContext(CONTEXTS, window);

  if (!(authority && clientId && redirectUri)) {
    // todo: feedback or logging
    return {
      isAuthed: false,
      reason: `Missing one or more of ${JSON.stringify({ authority, clientId, redirectUri })}`,
    };
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (window.location.href.toLowerCase().startsWith(redirectUri.toLowerCase())) {
    // todo: feedback or logging
    return {
      isAuthed: false,
      reason: "We think we are the MSAL AD redirectUri loading and hence not a real application",
    };
  }

  const instance = new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
    },
  });

  await instance.initialize();
  await instance.ssoSilent({
    scopes,
  });

  const accounts = instance.getAllAccounts();

  if (!accounts.length) {
    return {
      isAuthed: false,
      reason: "No AD accounts found",
    };
  }
  instance.setActiveAccount(accounts[0]);
  const { username, name, idTokenClaims } = instance.getActiveAccount();

  return {
    isAuthed: true,
    username: username?.toLowerCase(),
    name,
    groups: (idTokenClaims["groups"] as string[]) || [],
  };
};
