import { CmsAuthStorageKeys, HANDOVER_PARAM_KEYS, HANDOVER_STAGES } from "cps-global-configuration";
import { isStoredAuthCurrent } from "./core/storage";
import { createUrlWithParams, setParams, stripParams } from "./core/params";

// Stage 1 of the CMS → OS auth handover. The user arrives with the CMS cookies
// in the URL (`?cc=…`). If our stored cookies already match, we can skip the
// expensive token-fetch leg and signal "ready" — the mediator will route the
// user on. Otherwise we ask the mediator to navigate to the tokenHandoverUrl
// (a Polaris endpoint that fetches the modern CMS token cookie-side and
// bounces back at stage=os-token-return).
//
// This function does not write to `win.location`. The mediator owns all our
// in-estate navigation; we just return an intent.

export type OsCookieReturnOutcome =
  // Cookies match what's in storage — caller should route the user on to
  // `target` (typically via the ensure-ad preemptive AD check).
  | { kind: "ready"; target: string }
  // Cookies have changed — caller should navigate to `href`, which is a
  // pre-built URL pointing at the token-handover endpoint with our return
  // shape baked in.
  | { kind: "needs-token"; href: string };

export const handleOsCookieReturn = (
  win: Window,
  {
    tokenHandoverUrl,
    cmsAuthStorageKeys,
  }: {
    tokenHandoverUrl: string;
    cmsAuthStorageKeys: CmsAuthStorageKeys;
  },
): OsCookieReturnOutcome => {
  const url = new URL(win.location.href);
  const [cookies] = stripParams(url, HANDOVER_PARAM_KEYS.COOKIES);

  const canGoStraightToTarget = isStoredAuthCurrent(
    cookies,
    win.localStorage,
    cmsAuthStorageKeys,
  );

  if (canGoStraightToTarget) {
    const [target] = stripParams(url, HANDOVER_PARAM_KEYS.R);
    return { kind: "ready", target };
  }

  // Cookies have changed — route through the token-handover endpoint, which
  // returns us at stage=os-token-return with the modern CMS token attached.
  setParams(url, { [HANDOVER_PARAM_KEYS.STAGE]: HANDOVER_STAGES.OS_TOKEN_RETURN });
  const next = createUrlWithParams(tokenHandoverUrl, {
    [HANDOVER_PARAM_KEYS.R]: url.toString(),
    [HANDOVER_PARAM_KEYS.COOKIES]: cookies!,
  });
  return { kind: "needs-token", href: next.toString() };
};
