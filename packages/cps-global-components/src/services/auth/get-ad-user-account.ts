import { AccountInfo, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";
import { getErrorType } from "./get-error-type";
import { withLogging } from "../../logging/with-logging";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

type Props = {
  instance: PublicClientApplication;
  config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN: boolean | undefined };
  diagnosticsCollector?: AdDiagnosticsCollector;
};

type AccountSource = "cache" | "silent" | "popup" | "failed";

type AccountRetrievalResult = Promise<{ source: AccountSource; account: AccountInfo } | null>;

const loginRequest = { scopes: ["User.Read"] };

const { _debug } = makeConsole("getAdUserAccount");

const internalGetAdUserAccount = async ({ instance, config: { FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN }, diagnosticsCollector }: Props) => {
  const t0 = performance.now();

  const tryGetAccountFromCache = async (): AccountRetrievalResult => {
    const tCache = performance.now();
    const account = instance.getActiveAccount();
    diagnosticsCollector?.add({
      cacheCheckStartMs: Math.round(tCache),
      cacheCheckDurationMs: Math.round(performance.now() - tCache),
    });
    return account ? { source: "cache", account } : null;
  };

  const tryGetAccountSilently = async (): AccountRetrievalResult => {
    const tSilent = performance.now();
    let pageHiddenDuringAuth = false;
    let beforeUnloadFired = false;

    const onVisibilityChange = () => {
      if (document.hidden) pageHiddenDuringAuth = true;
    };
    const onBeforeUnload = () => {
      beforeUnloadFired = true;
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("beforeunload", onBeforeUnload);

    try {
      const { account } = await instance.ssoSilent(loginRequest);
      diagnosticsCollector?.add({
        ssoSilentStartMs: Math.round(tSilent),
      });
      return account ? { source: "silent", account } : null;
    } catch (error) {
      const errorType = getErrorType(error);

      diagnosticsCollector?.add({
        ssoSilentStartMs: Math.round(tSilent),
        pageHiddenDuringAuth,
        beforeUnloadFired,
        documentHiddenAtFailure: document.hidden,
        visibilityStateAtFailure: document.visibilityState,
        navigatorOnLineAtFailure: navigator.onLine,
        connectionType: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null,
        connectionDownlink: (navigator as unknown as { connection?: { downlink?: number } }).connection?.downlink ?? null,
      });

      if (FEATURE_FLAG_ENABLE_INTRUSIVE_AD_LOGIN) {
        if (errorType === "MultipleIdentities") {
          return null;
        }
      }
      throw error;
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("beforeunload", onBeforeUnload);
    }
  };

  const tryGetAccountViaPopup = async (): AccountRetrievalResult => {
    diagnosticsCollector?.add({ loginPopupStartMs: Math.round(performance.now()) });
    const { account } = await instance.loginPopup(loginRequest);
    return account ? { source: "popup", account } : null;
  };

  const { account, source } = (await tryGetAccountFromCache()) || (await tryGetAccountSilently()) || (await tryGetAccountViaPopup()) || { source: "failed", account: null };
  instance.setActiveAccount(account);

  diagnosticsCollector?.add({
    authSource: source,
    authTotalDurationMs: Math.round(performance.now() - t0),
  });

  _debug("Source", source);
  return account;
};

export const getAdUserAccount = withLogging("getAdUserAccount", internalGetAdUserAccount);
