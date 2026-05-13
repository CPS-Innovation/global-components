import { CmsAuthStorageKeys, HANDOVER_PARAM_KEYS } from "cps-global-configuration";
import { isStoredTokenSameAs, setCmsSessionHint, storeAuth } from "./core/storage";
import { stripParams } from "./core/params";
import { getCmsSessionHint } from "./core/get-cms-session-hint";
import { resetTasklistFilters } from "./application-logic/reset-tasklist-filters";

// Stage 2 of the CMS → OS auth handover. Token cookie just fetched; persist
// the modern CMS auth into OS localStorage in the shape OS expects, optionally
// stash a session hint, and navigate to the target. If the new token differs
// from what was stored (fresh auth context), reset OS tasklist filters in
// test envs so the user isn't stuck with stale filter state from a previous
// session.

export const handleOsTokenReturn = async (
  win: Window,
  { cmsAuthStorageKeys }: { cmsAuthStorageKeys: CmsAuthStorageKeys },
): Promise<void> => {
  const url = new URL(win.location.href);
  const [target, cookies, token] = stripParams(
    url,
    HANDOVER_PARAM_KEYS.R,
    HANDOVER_PARAM_KEYS.COOKIES,
    HANDOVER_PARAM_KEYS.TOKEN,
  );

  const didUpdateToken = !isStoredTokenSameAs(
    token,
    win.localStorage,
    cmsAuthStorageKeys,
  );
  storeAuth(cookies, token, win.localStorage, cmsAuthStorageKeys);

  if (didUpdateToken && win.location.hostname.startsWith("cps-tst")) {
    // FCT2-16735: a fresh token means a fresh auth context — clear stale
    // tasklist filters so the user lands in OS without inherited filter state
    // from a previous session. Hostname check is a temporary feature gate
    // limiting this to test envs.
    resetTasklistFilters(win);
  }

  await maybeSetCmsSessionHint({ nextUrl: target, cmsAuthStorageKeys, storage: win.localStorage });

  win.location.replace(target);
};

const maybeSetCmsSessionHint = async ({
  nextUrl,
  cmsAuthStorageKeys,
  storage,
}: {
  nextUrl: string;
  cmsAuthStorageKeys: CmsAuthStorageKeys;
  storage: Storage;
}): Promise<void> => {
  try {
    if (!new URL(nextUrl).pathname.toLowerCase().startsWith("/casework_blocks/")) {
      // Only set the hint when handing the user back to the OS home page.
      return;
    }

    const cmsSessionHint = await getCmsSessionHint();
    setCmsSessionHint(cmsSessionHint, storage, cmsAuthStorageKeys);
  } catch (err) {
    console.log(`handleSettingCmsSessionHint error: ${err}`);
  }
};
