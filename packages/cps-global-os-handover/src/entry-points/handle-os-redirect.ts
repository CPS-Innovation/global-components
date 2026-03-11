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
    cps_global_components_cookie_handover_url: string;
    cps_global_components_token_handover_url: string;
  }
}

export const handleOsRedirect = async (window: Window) => {
  const inputUrls = extractUrls(window);
  const { stage, nextUrl } = handleOsRedirectInternal(inputUrls);
  await handleSettingCmsSessionHint({ stage, nextUrl });
  window.location.replace(nextUrl);
};

const extractUrls = (window: Window) => {
  const cookieHandoverUrl = window.cps_global_components_cookie_handover_url;
  if (!cookieHandoverUrl) {
    throw new Error(
      `window.cps_global_components_cookie_handover_url not specified`,
    );
  }

  const tokenHandoverUrl = window.cps_global_components_token_handover_url;
  if (!tokenHandoverUrl) {
    throw new Error(
      `window.cps_global_components_token_handover_url not specified`,
    );
  }

  const currentUrl = window.location.href;

  return {
    currentUrl,
    cookieHandoverUrl,
    tokenHandoverUrl,
  };
};

/** Used at the point of redirecting on the OS domain.  */
export const handleOsRedirectInternal = ({
  currentUrl,
  cookieHandoverUrl,
  tokenHandoverUrl,
}: {
  currentUrl: string;
  cookieHandoverUrl: string;
  tokenHandoverUrl: string;
}) => {
  const url = new URL(currentUrl);
  const [stage] = stripParams(url, paramKeys.STAGE);

  switch (stage) {
    case stages.OS_OUTBOUND: {
      // FCT2-10942: at the time of writing, in proxied CMS pre-prod environments
      //  there is a slight misconfiguration.  We hit this stage when the C button
      //  is pressed in CMS. In pre-prod the proxy is sending the request
      //  via the /polaris endpoint on the way here.  This is not quite right as
      //  that stage will have appended a cc parameter with cookies to the request
      //  we are handling. Our logic in this stage is to redirect the URL as we find
      //  it on to the /polaris endpoint in order for that next step to get our cookies
      //  and to redirect us to the next stage below. This current configuration
      //  results in two cc params being appended to the redirected URL, which then breaks
      //  IIS in OutSystems because of query length restrictions.
      //
      // Really if the proxy wants to do it this way it should be sending the C button
      //  request via the cookie return stage below. However it is a) easier and quicker to
      //  fix here and b) a reasonably useful thing to do to always make sure we are not
      //  sending a cc parameter to the /polaris endpoint no matter the circumstances.
      //  So let's strip the cc param if we have one as it should appear in the next stage.

      // FCT2-11384: app to app navigation used to come via this step. The thinking there
      //  was to delegate anything to do with app navigation and auth handover to this
      //  location and let all the various phases of acquiring auth to just keep bouncing
      //  through here. The flaw with that is that we get an extra history entry in the
      //  user's browser history. If the user has gone from page A to page B via here then
      //  pressing the browser back button brings the user here and they get forwarded
      //  straight back to page B. The bug fix involves switching to using
      //  `createOutboundUrlDirect` which means the navigation skips this stage and goes
      //  straight to the next step. This leaves this stage only being used by the C button
      //  as per the prior comment, and even that should not be using this step.  Also
      //  this stage is called "os-outbound" and in the remaining use case is more inbound
      //  than "outbound"!

      stripParams(url, paramKeys.COOKIES);

      setParams(url, { [paramKeys.STAGE]: stages.OS_COOKIE_RETURN });

      const nextUrl = createUrlWithParams(cookieHandoverUrl, {
        [paramKeys.R]: url.toString(),
      });

      return { stage, nextUrl: nextUrl.toString() };
    }
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
