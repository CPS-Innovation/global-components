import { CmsAuthStorageKeys, HANDOVER_PARAM_KEYS, HANDOVER_STAGES } from "cps-global-configuration";
import { isStoredAuthCurrent } from "./core/storage";
import { createUrlWithParams, setParams, stripParams } from "./core/params";
import { navigateViaEnsureAd } from "./navigate-via-ensure-ad";

// Stage 1 of the CMS → OS auth handover. The user arrives with the CMS cookies
// in the URL (`?cc=…`). If our stored cookies already match, we can skip the
// expensive token-fetch leg and go straight to the target URL. Otherwise we
// hop to the tokenHandoverUrl (a Polaris endpoint that fetches the modern
// CMS token cookie-side and bounces us back at stage=os-token-return).

export const handleOsCookieReturn = (
  win: Window,
  {
    tokenHandoverUrl,
    cmsAuthStorageKeys,
  }: {
    tokenHandoverUrl: string;
    cmsAuthStorageKeys: CmsAuthStorageKeys;
  },
): void => {
  const url = new URL(win.location.href);
  const [cookies] = stripParams(url, HANDOVER_PARAM_KEYS.COOKIES);

  const canGoStraightToTarget = isStoredAuthCurrent(
    cookies,
    win.localStorage,
    cmsAuthStorageKeys,
  );

  if (canGoStraightToTarget) {
    // Cookies in storage match what was just handed to us. Before letting the
    // user reach the OS app, bounce through ensure-ad so the AD silent check
    // happens on this endpoint rather than after the OS app has booted.
    const [target] = stripParams(url, HANDOVER_PARAM_KEYS.R);
    navigateViaEnsureAd(win, target);
    return;
  }

  // Cookies have changed — route through the token-handover endpoint, which
  // returns us at stage=os-token-return with the modern CMS token attached.
  setParams(url, { [HANDOVER_PARAM_KEYS.STAGE]: HANDOVER_STAGES.OS_TOKEN_RETURN });
  const nextUrl = createUrlWithParams(tokenHandoverUrl, {
    [HANDOVER_PARAM_KEYS.R]: url.toString(),
    [HANDOVER_PARAM_KEYS.COOKIES]: cookies!,
  });
  win.location.replace(nextUrl.toString());
};
