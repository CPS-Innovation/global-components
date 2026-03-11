import { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";
import { Result } from "../../utils/Result";

type Props = {
  instance: PublicClientApplication;
  config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined };
  authHint?: Result<string>;
  setAuthHint?: (sid: string) => void;
};

type AccountSource = "cache" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const { _debug } = makeConsole("getAdUserAccount");

const updateAuthHint = (account: AccountInfo | null, setAuthHint?: (sid: string) => void) => {
  const sid = account?.idTokenClaims?.["sid"] as string | undefined;
  if (sid && setAuthHint) {
    setAuthHint(sid);
  }
};

const internalGetAdUserAccount = async ({ instance, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN }, authHint, setAuthHint }: Props) => {
  const hintSid = authHint?.found ? authHint.result : undefined;

  const tryGetAccountFromCache = async (): AccountRetrievalResult => {
    const account = instance.getActiveAccount();
    return account ? { source: "cache", account } : null;
  };

  const tryGetAccountSilently = async (): AccountRetrievalResult => {
    try {
      const sid = FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN && hintSid ? hintSid : undefined;
      const { account } = await instance.ssoSilent({ ...loginRequest, ...(sid && { sid }) });
      return account ? { source: "silent", account } : null;
    } catch (error) {
      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN) {
        const errorType = getErrorType(error);
        if (errorType === "MultipleIdentities" || hintSid) {
          // If the user has multiple accounts or we provided a stale sid,
          //  stifle the error and let our logic roll on to popup
          return null;
        }
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
  updateAuthHint(account, setAuthHint);
  _debug("Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
