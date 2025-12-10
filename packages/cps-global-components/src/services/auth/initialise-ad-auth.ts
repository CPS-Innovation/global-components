import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { withLogging } from "../../logging/with-logging";
import { makeConsole } from "../../logging/makeConsole";
import { AuthResult, FailedAuth, KnowErrorType } from "./AuthResult";
import { getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";
import { createMsalInstance } from "./create-msal-instance";
import { getTokenFactory } from "./get-token-factory";
import { GetToken } from "./GetToken";

type Props = {
  config: Config;
  context: FoundContext;
};

const failedAuth = (knownErrorType: KnowErrorType, reason: string): { auth: FailedAuth; getToken: GetToken } => ({
  auth: {
    isAuthed: false,
    knownErrorType,
    reason,
  },
  getToken: () => Promise.resolve(null),
});

const { _error } = makeConsole("initialiseAuth");

const initialiseAdAuthInternal = async ({
  config: { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN },
  context: { msalRedirectUrl: redirectUri, currentHref },
}: Props): Promise<{ auth: AuthResult; getToken: GetToken }> => {
  if (!(authority && clientId && redirectUri)) {
    return failedAuth("ConfigurationIncomplete", `Found configuration is: ${JSON.stringify({ authority, clientId, redirectUri })}`);
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (currentHref.startsWith(redirectUri.toLowerCase())) {
    return failedAuth("RedirectLocationIsApp", "We think we are the MSAL AD redirectUri loading and hence not a real application");
  }

  try {
    const instance = await createMsalInstance({ authority, clientId, redirectUri });
    const account = await getAdUserAccount({ instance, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN } });
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
