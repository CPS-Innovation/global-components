import { createUrlWithParams, setParams, stripParams } from "../core/params";
import { paramKeys, stages } from "../core/constants";

export const handleForcedRedirect = ({
  window,
  handoverUrl,
}: {
  window: Window;
  handoverUrl: string;
}) => {
  const url = new URL(window.location.href);
  const [stage] = stripParams(url, paramKeys.STAGE);
  if (stage === stages.OS_FORCED_AUTH_RETURN) {
    stripParams(url, paramKeys.STAGE);
    window.history.replaceState({}, "", url);
    return false;
  } else {
    setParams(url, { [paramKeys.STAGE]: stages.OS_FORCED_AUTH_RETURN });
    const nextUrl = createUrlWithParams(handoverUrl, {
      [paramKeys.STAGE]: stages.OS_OUTBOUND,
      [paramKeys.R]: url.toString(),
    });
    window.location.replace(nextUrl);
    return true;
  }
};
