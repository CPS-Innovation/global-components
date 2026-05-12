import {
  isStoredAuthCurrent,
  isStoredTokenSameAs,
  setCmsSessionHint,
  storeAuth,
} from "../core/storage";
import { createUrlWithParams, setParams, stripParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";
import { getCmsSessionHint } from "../core/get-cms-session-hint";
import { resetTasklistFilters } from "../application-logic/reset-tasklist-filters";
import { handleMsalLogin, handleMsalTermination } from "cps-global-auth";

// AAD response hashes always carry one of these. Cheap pattern beats parsing
// the whole hash, and avoids pulling MSAL just to ask "is this a response?".
const hasAuthResponseHash = (hash: string): boolean =>
  /[#&](code|error|id_token)=/.test(hash);
import { CmsAuthStorageKeys } from "cps-global-configuration";

export const handleOsRedirect = async (
  window: Window,
  tokenHandoverUrl: string,
  fetchMsalConfig: () => Promise<{ clientId: string; authority: string }>,
  cmsAuthStorageKeys: CmsAuthStorageKeys,
) => {
  // The os-ad-redirect stage is the AAD bounce-back from a full-page MSAL
  // loginRedirect. The registered redirect URI bakes ?src=…&stage=os-ad-redirect
  // into itself; AAD preserves both on the bounce-back URL and appends the
  // response in the hash. Dispatch straight to handleMsalTermination — MSAL
  // navigates back to the originating URL on its own (navigateToLoginRequestUrl).
  // fetchMsalConfig is invoked only on this branch — cookie/token return paths
  // do not pay the network round-trip.
  const params = new URL(window.location.href).searchParams;
  const incomingStage = params.get(paramKeys.STAGE);
  const hash = window.location.hash;
  const action = params.get("action");
  console.log("[CPS-GLOBAL-AUTH] handleOsRedirect dispatch", {
    stage: incomingStage,
    action,
    hash,
    hasResponseHash: hasAuthResponseHash(hash),
    href: window.location.href,
  });
  if (incomingStage === stages.OS_AD_REDIRECT) {
    const msalConfig = await fetchMsalConfig();
    // Two roles share this URL — discriminate by URL shape.
    //   - AAD bounce-back (response hash present) → terminate
    //   - Host-initiated hand-off (?action=login&returnTo=…) → initiate loginRedirect
    // Anything else (neither hash nor action) is direct access / odd state; no-op.
    if (hasAuthResponseHash(hash)) {
      await handleMsalTermination(window, msalConfig);
    } else if (action === "login") {
      // Keep ?src=…&stage=os-ad-redirect on the AAD redirect URI — the OS-served
      // auth-handover.html reads ?src= to script-inject the bundle on the
      // bounce-back. Strip only our own dispatch params (action/returnTo) and
      // the hash. Both forms (with/without src+stage query tail) are registered
      // in the AAD app reg.
      const url = new URL(window.location.href);
      url.searchParams.delete("action");
      url.searchParams.delete("returnTo");
      url.hash = "";
      const redirectUri = url.href;
      await handleMsalLogin(
        window,
        msalConfig,
        params.get("returnTo"),
        redirectUri,
      );
    }
    return;
  }

  const { stage, nextUrl, didUpdateToken } = handleOsRedirectInternal({
    currentUrl: window.location.href,
    tokenHandoverUrl,
    cmsAuthStorageKeys,
  });

  if (didUpdateToken && window.location.hostname.startsWith("cps-tst")) {
    // FCT2-16735: a fresh token means a fresh auth context — clear stale tasklist filters
    // so the user lands in OS without inherited filter state from a previous session.
    // Hostname check is a temporary poor-man's feature flag to limit this to test envs.
    resetTasklistFilters(window);
  }

  await handleSettingCmsSessionHint({ stage, nextUrl, cmsAuthStorageKeys });

  window.location.replace(nextUrl);
};

/** Used at the point of redirecting on the OS domain.  */
export const handleOsRedirectInternal = ({
  currentUrl,
  tokenHandoverUrl,
  cmsAuthStorageKeys,
}: {
  currentUrl: string;
  tokenHandoverUrl: string;
  cmsAuthStorageKeys: CmsAuthStorageKeys;
}) => {
  const url = new URL(currentUrl);
  const [stage] = stripParams(url, paramKeys.STAGE);

  switch (stage) {
    case stages.OS_COOKIE_RETURN: {
      const [cookies] = stripParams(url, paramKeys.COOKIES);

      const canGoStraightToTarget = isStoredAuthCurrent(
        cookies,
        localStorage,
        cmsAuthStorageKeys,
      );

      if (canGoStraightToTarget) {
        // The cookies we have in storage are the same as the ones we have been just given
        //  which means that our values as currently stored are still valid
        const [target] = stripParams(url, paramKeys.R);
        return { stage, nextUrl: target, didUpdateToken: false };
      }

      setParams(url, { [paramKeys.STAGE]: stages.OS_TOKEN_RETURN });
      const nextUrl = createUrlWithParams(tokenHandoverUrl, {
        [paramKeys.R]: url.toString(),
        [paramKeys.COOKIES]: cookies!,
      });

      return { stage, nextUrl: nextUrl.toString(), didUpdateToken: false };
    }
    case stages.OS_TOKEN_RETURN: {
      const [target, cookies, token] = stripParams(
        url,
        paramKeys.R,
        paramKeys.COOKIES,
        paramKeys.TOKEN,
      );

      const didUpdateToken = !isStoredTokenSameAs(
        token,
        localStorage,
        cmsAuthStorageKeys,
      );
      storeAuth(cookies, token, localStorage, cmsAuthStorageKeys);

      return { stage, nextUrl: target, didUpdateToken };
    }
    default:
      throw new Error(
        `Unknown ${paramKeys.STAGE} query parameter: ${stage || "empty"}`,
      );
  }
};

const handleSettingCmsSessionHint = async ({
  stage,
  nextUrl,
  cmsAuthStorageKeys,
}: {
  stage: string;
  nextUrl: string;
  cmsAuthStorageKeys: CmsAuthStorageKeys;
}) => {
  try {
    if (stage !== stages.OS_TOKEN_RETURN) {
      // Only set this on the final part of the auth handover...
      return;
    }

    if (
      !new URL(nextUrl).pathname.toLowerCase().startsWith("/casework_blocks/")
    ) {
      //... and only if we are going to the home page site
      return;
    }

    const cmsSessionHint = await getCmsSessionHint();
    setCmsSessionHint(cmsSessionHint, localStorage, cmsAuthStorageKeys);
  } catch (err) {
    console.log(`handleSettingCmsSessionHint error: ${err}`);
  }
};
