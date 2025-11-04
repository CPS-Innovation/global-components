import { isStoredAuthCurrent, storeAuth } from "../core/storage";
import { createUrlWithParams, setParams, stripParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";

declare global {
  interface Window {
    cps_global_components_cookie_handover_url: string;
    cps_global_components_token_handover_url: string;
  }
}

export const handleOsRedirect = (window: Window) => {
  const inputUrls = extractUrls(window);
  const nextUrl = handleOsRedirectInternal(inputUrls);
  window.location.replace(nextUrl);
};

const extractUrls = (window: Window) => {
  const cookieHandoverUrl = window.cps_global_components_cookie_handover_url;
  if (!cookieHandoverUrl) {
    throw new Error(
      `window.cps_global_components_cookie_handover_url not specified`
    );
  }

  const tokenHandoverUrl = window.cps_global_components_token_handover_url;
  if (!tokenHandoverUrl) {
    throw new Error(
      `window.cps_global_components_token_handover_url not specified`
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
      // request via the cookie return stage below. However it is a) easier and quicker to
      // fix here and b) a reasonably useful thing to do to always make sure we are not
      // sending a cc parameter to the /polaris endpoint no matter the circumstances.
      // So let's strip the cc param if we have one as it should appear in the next stage.
      stripParams(url, paramKeys.COOKIES);

      setParams(url, { [paramKeys.STAGE]: stages.OS_COOKIE_RETURN });

      const nextUrl = createUrlWithParams(cookieHandoverUrl, {
        [paramKeys.R]: url.toString(),
      });

      return nextUrl.toString();
    }
    case stages.OS_COOKIE_RETURN: {
      const [cookies] = stripParams(url, paramKeys.COOKIES);

      const canGoStraightToTarget = isStoredAuthCurrent(cookies);

      if (canGoStraightToTarget) {
        // The cookies we have in storage are the same as the ones we have been just given
        //  which means that our values as currently stored are still valid
        const [target] = stripParams(url, paramKeys.R);
        return target;
      }

      setParams(url, { [paramKeys.STAGE]: stages.OS_TOKEN_RETURN });
      const nextUrl = createUrlWithParams(tokenHandoverUrl, {
        [paramKeys.R]: url.toString(),
        [paramKeys.COOKIES]: cookies!,
      });

      return nextUrl.toString();
    }
    case stages.OS_TOKEN_RETURN: {
      const [target, cookies, token] = stripParams(
        url,
        paramKeys.R,
        paramKeys.COOKIES,
        paramKeys.TOKEN
      );

      storeAuth(cookies, token);

      return target;
    }
    default:
      throw new Error(
        `Unknown ${paramKeys.STAGE} query parameter: ${stage || "empty"}`
      );
  }
};
