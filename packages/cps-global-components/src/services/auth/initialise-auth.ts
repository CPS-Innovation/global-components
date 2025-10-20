import { InteractionRequiredAuthError, LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/find-context";
import { withLogging } from "../../logging/with-logging";
import { _console } from "../../logging/_console";

const MSAL_ERROR_CODES = {
  ConditionalAccessRule: "AADSTS53003",
  MultipleIdentities: "AADSTS16000",
};

type Props = {
  window: Window;
  config: Config;
  context: FoundContext;
};

export type Auth = {
  isAuthed: true;
  username: string;
  name: string | undefined;
  groups: string[];
  objectId: string;
};

export type FailedAuth = {
  isAuthed: false;
  knownErrorType: "ConfigurationIncomplete" | "RedirectLocationIsApp" | "NoAccountFound" | "ConditionalAccessRule" | "MultipleIdentities" | "Unknown";
  reason: string;
};

export type AuthResult = Auth | FailedAuth;

const scopes = ["User.Read"];

const initialise = async ({
  window: { location },
  config: { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN },
  context: { msalRedirectUrl: redirectUri },
}: Props): Promise<AuthResult> => {
  if (!(authority && clientId && redirectUri)) {
    // todo: feedback or logging
    const missingValues = Object.entries({ authority, clientId, redirectUri })
      .filter(([, value]) => !value)
      .map(([key]) => key)
      .join(",");

    return {
      isAuthed: false,
      knownErrorType: "ConfigurationIncomplete",
      reason: `Configuration is missing the following values: ${missingValues}`,
    };
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (location.href.toLowerCase().startsWith(redirectUri.toLowerCase())) {
    // todo: feedback or logging
    return {
      isAuthed: false,
      knownErrorType: "RedirectLocationIsApp",
      reason: "We think we are the MSAL AD redirectUri loading and hence not a real application",
    };
  }

  const instance = new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
      // navigateToLoginRequestUrl: false,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: true,
    },
    system: {
      iframeHashTimeout: 6000, // Reduce timeout to fail faster
      loadFrameTimeout: 6000,
      allowPlatformBroker: false,
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          _console.debug("initialiseAuth", "MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

  try {
    await instance.initialize();
    try {
      await instance.ssoSilent({
        scopes,
        prompt: "none",
      });
    } catch (error) {
      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN && error instanceof InteractionRequiredAuthError && error.message.includes(MSAL_ERROR_CODES.MultipleIdentities)) {
        await instance.loginPopup({
          scopes,
        });
      } else {
        throw error;
      }
    }

    const accounts = instance.getAllAccounts();

    if (!accounts.length) {
      return {
        isAuthed: false,
        knownErrorType: "NoAccountFound",
        reason: "No AD accounts found",
      };
    }
    instance.setActiveAccount(accounts[0]);

    const { username, name, idTokenClaims, localAccountId } = accounts[0];

    return {
      isAuthed: true,
      username: username.toLowerCase(),
      name,
      objectId: localAccountId,
      groups: (idTokenClaims && (idTokenClaims["groups"] as string[])) || [],
    };
  } catch (error) {
    _console.error({ authority, clientId, redirectUri, error });
    if (error instanceof InteractionRequiredAuthError) {
      return {
        isAuthed: false,
        knownErrorType: error.message.includes(MSAL_ERROR_CODES.ConditionalAccessRule)
          ? "ConditionalAccessRule"
          : error.message.includes(MSAL_ERROR_CODES.MultipleIdentities)
          ? "MultipleIdentities"
          : "Unknown",
        reason: `${error}`,
      };
    }

    return {
      isAuthed: false,
      knownErrorType: "Unknown",
      reason: `${error}`,
    };
  }
};

export const initialiseAuth = withLogging("initialiseAuth", initialise);
