import {
  isStoredAuthCurrent,
  setCmsSessionHint,
  storeAuth,
} from "../core/storage";
import { createUrlWithParams, setParams, stripParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";
import { getCmsSessionHint } from "../core/get-cms-session-hint";

declare global {
  interface Window {
    cps_global_components_token_handover_url: string;
  }
}

export const handleOsRedirect = async (window: Window) => {
  const tokenHandoverUrl = window.cps_global_components_token_handover_url;
  if (!tokenHandoverUrl) {
    throw new Error(
      `window.cps_global_components_token_handover_url not specified`,
    );
  }

  const { stage, nextUrl } = handleOsRedirectInternal({
    currentUrl: window.location.href,
    tokenHandoverUrl,
  });
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
        return { stage, nextUrl: target };
      }

      setParams(url, { [paramKeys.STAGE]: stages.OS_TOKEN_RETURN });
      const nextUrl = createUrlWithParams(tokenHandoverUrl, {
        [paramKeys.R]: url.toString(),
        [paramKeys.COOKIES]: cookies!,
      });

      return { stage, nextUrl: nextUrl.toString() };
    }
    case stages.OS_TOKEN_RETURN: {
      const [target, cookies, token] = stripParams(
        url,
        paramKeys.R,
        paramKeys.COOKIES,
        paramKeys.TOKEN,
      );

      storeAuth(cookies, token, localStorage);

      return { stage, nextUrl: target };
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
