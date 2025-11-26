import { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";

type Props = { instance: PublicClientApplication; config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined } };

type AccountSource = "cache" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const { _debug } = makeConsole("getAdUserAccount");

const internalGetAdUserAccount = async ({ instance, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN } }: Props) => {
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
  _debug("Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
