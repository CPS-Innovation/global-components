import { createUrlWithParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";

/** Used to create a navigation link that utilises OS auth handover
 *  but skips the first stage and goes straight to the cookie
 *  handover endpoint
 */
export const createOutboundUrlDirect = ({
  cookieHandoverUrl,
  handoverUrl,
  targetUrl,
}: {
  cookieHandoverUrl: string;
  handoverUrl: string;
  targetUrl: string;
}) => {
  const redirectUrl = createUrlWithParams(handoverUrl, {
    [paramKeys.STAGE]: stages.OS_COOKIE_RETURN,
    [paramKeys.R]: targetUrl,
  });

  const nextUrl = createUrlWithParams(cookieHandoverUrl, {
    [paramKeys.R]: redirectUrl.toString(),
  });

  return nextUrl.toString();
};
