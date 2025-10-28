import { AccountInfo, LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { _console } from "../../logging/_console";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";

type InternalProps = { authority: string; clientId: string; redirectUri: string };

type Props = InternalProps & { config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined } };

type AccountSource = "cache" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const createInstance = ({ authority, clientId, redirectUri }: InternalProps) =>
  new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
    },
    cache: {
      // Note: no strong reason for choosing localStorage other than we are in a world
      //  where we are skipping around different apps, and possibly different tabs.
      cacheLocation: "localStorage",
    },
    system: {
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          const logFn = level === LogLevel.Error ? _console.error : level === LogLevel.Warning ? _console.warn : _console.debug;
          logFn("getAdUserAccount", "MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

export const internalGetAdUserAccount = async ({ authority, clientId, redirectUri, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN } }: Props) => {
  const instance = createInstance({ authority, clientId, redirectUri });
  await instance.initialize();

  const tryGetAccountFromCache = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount();
    return account ? { source: "cache", account } : null;
  };

  const tryGetAccountSilently = async (): AccountRetrievalResult => {
    try {
      const { account } = await instance.ssoSilent(loginRequest);
      return account ? { source: "silent", account } : null;
    } catch (error) {
      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN && getErrorType(error) === "MultipleIdentities") {
        // If the user has multiple accounts in the browser then we stifle the error and let our logic roll on
        //  the next check
        return null;
      }
      throw error;
    }
  };

  const tryGetAccountViaPopup = async (): AccountRetrievalResult => {
    const { account } = await instance.loginPopup(loginRequest);
    return account ? { source: "popup", account } : null;
  };

  const { account, source } = (await tryGetAccountFromCache()) || (await tryGetAccountSilently()) || (await tryGetAccountViaPopup()) || { source: "failed", account: null };
  instance.setActiveAccount(account);
  _console.debug("getAdUserAccount", "Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
