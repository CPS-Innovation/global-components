import { Config } from "cps-global-configuration";
import { FoundContext } from "../context/FoundContext";
import { withLogging } from "../../logging/with-logging";
import { _console } from "../../logging/_console";
import { AuthResult, FailedAuth, KnowErrorType } from "./AuthResult";
import { getAdUserAccount } from "./get-ad-user-account";
import { getErrorType } from "./get-error-type";

type Props = {
  window: Window;
  config: Config;
  context: FoundContext;
};

const failedAuth = (knownErrorType: KnowErrorType, reason: string): FailedAuth => ({
  isAuthed: false,
  knownErrorType,
  reason,
});

const initialiseAuthInternal = async ({
  window: { location },
  config: { AD_TENANT_AUTHORITY: authority, AD_CLIENT_ID: clientId, FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN },
  context: { msalRedirectUrl: redirectUri },
}: Props): Promise<AuthResult> => {
  if (!(authority && clientId && redirectUri)) {
    return failedAuth("ConfigurationIncomplete", `Found configuration is: ${{ authority, clientId, redirectUri }}`);
  }

  // For development (possibly other instances) if we detect we are being launched on an
  //  AD auth callback redirectUrl then we are spinning up inside an iframe or popup.  The intention
  //  is not to spin up an app really - it is just somewhere for AD to land. Whatever we do,
  //  don't launch MSAL if it is the redirectUrl that we are launching
  if (location.href.toLowerCase().startsWith(redirectUri.toLowerCase())) {
    return failedAuth("RedirectLocationIsApp", "We think we are the MSAL AD redirectUri loading and hence not a real application");
  }

  try {
    const account = await getAdUserAccount({ authority, clientId, redirectUri, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN } });

    return account
      ? {
          isAuthed: true,
          username: account.username.toLowerCase(),
          name: account.name,
          objectId: account.localAccountId,
          groups: (account.idTokenClaims?.["groups"] as string[]) || [],
        }
      : failedAuth("NoAccountFound", "No AD account found");
  } catch (error) {
    _console.error({ authority, clientId, redirectUri, error });
    return failedAuth(getErrorType(error), `${error}`);
  }
};

export const initialiseAuth = withLogging("initialiseAuth", initialiseAuthInternal);
