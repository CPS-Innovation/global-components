import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { _console } from "../../logging/_console";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";

type InternalProps = { authority: string; clientId: string; redirectUri: string };

type Props = InternalProps & { config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined } };

const loginRequest = { scopes: ["User.Read"] };

const createInstance = ({ authority, clientId, redirectUri }: InternalProps) =>
  new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
    },
    cache: {
      // Note: no strong reason for choosing localStorage other than
      cacheLocation: "localStorage",
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          _console.debug("initialiseAuth", "MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

export const internalGetAdUserAccount = async ({ authority, clientId, redirectUri, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN } }: Props) => {
  const instance = createInstance({ authority, clientId, redirectUri });
  await instance.initialize();

  const tryGetAccountFromCache = async () => instance.getActiveAccount();

  const tryGetAccountSilently = async () => {
    try {
      return (await instance.ssoSilent(loginRequest)).account;
    } catch (error) {
      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN && getErrorType(error) === "MultipleIdentities") {
        // If the user has multiple accounts in the browser then we stifle the error and let our logic roll on
        return null;
      }
      throw error;
    }
  };

  const tryGetAccountViaPopup = async () => (await instance.loginPopup(loginRequest)).account;

  return (await tryGetAccountFromCache()) || (await tryGetAccountSilently()) || (await tryGetAccountViaPopup());
};

export const getAdUserAccount = withLogging("internalGetUserAccount", internalGetAdUserAccount);
