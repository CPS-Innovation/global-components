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

export const handleOsRedirect = async (window: Window, tokenHandoverUrl: string) => {
  const { stage, nextUrl, didUpdateToken } = handleOsRedirectInternal({
    currentUrl: window.location.href,
    tokenHandoverUrl,
  });
  if (didUpdateToken && window.location.hostname.startsWith("cps-tst")) {
    // FCT2-16735: a fresh token means a fresh auth context — clear stale tasklist filters
    // so the user lands in OS without inherited filter state from a previous session.
    // Hostname check is a temporary poor-man's feature flag to limit this to test envs.
    resetTasklistFilters(window);
  }
  await handleSettingCmsSessionHint({ stage, nextUrl });
  window.location.replace(nextUrl);
};

/** Used at the point of redirecting on the OS domain.  */
export const handleOsRedirectInternal = ({
  currentUrl,
  tokenHandoverUrl,
}: {
  currentUrl: string;
  tokenHandoverUrl: string;
}) => {
  const url = new URL(currentUrl);
  const [stage] = stripParams(url, paramKeys.STAGE);

  switch (stage) {
    case stages.OS_COOKIE_RETURN: {
      const [cookies] = stripParams(url, paramKeys.COOKIES);

      const canGoStraightToTarget = isStoredAuthCurrent(cookies, localStorage);

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

      const didUpdateToken = !isStoredTokenSameAs(token, localStorage);
      storeAuth(cookies, token, localStorage);

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
}: {
  stage: string;
  nextUrl: string;
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
    setCmsSessionHint(cmsSessionHint, localStorage);
  } catch (err) {
    console.log(`handleSettingCmsSessionHint error: ${err}`);
  }
};
