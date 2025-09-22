import { createUrlWithParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";

/** Used to create a navigation link that utilises OS auth handover. */
export const createOutboundUrl = ({
  handoverUrl,
  targetUrl,
}: {
  handoverUrl: string;
  targetUrl: string;
}) => {
  const nextUrl = createUrlWithParams(handoverUrl, {
    [paramKeys.STAGE]: stages.OS_OUTBOUND,
    [paramKeys.R]: targetUrl,
  });

  return nextUrl.toString();
};
