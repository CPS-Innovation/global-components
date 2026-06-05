import { CmsAuthStorageKeys, CmsSessionHint } from "cps-global-configuration";
import { areAllCookieStringsEqual } from "./are-all-cookie-strings-equal";

export const storeAuth = (
  cookies: string,
  token: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => {
  const cmsAuthValuesJson = JSON.stringify({
    Cookies: cookies,
    Token: token,
    ExpiryTime: new Date().toISOString(),
  });

  storage[keys.WMA_COOKIES] = cookies;
  storage[keys.CASE_REVIEW_COOKIES] = cookies;
  storage[keys.HOME_COOKIES] = cookies;
  storage[keys.WMA_JSON] = cmsAuthValuesJson;
  storage[keys.CASE_REVIEW_JSON] = cmsAuthValuesJson;
  storage[keys.HOME_JSON] = cmsAuthValuesJson;
};

export const isStoredAuthCurrent = (
  cookies: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) =>
  areAllCookieStringsEqual(
    cookies,
    storage[keys.WMA_COOKIES],
    storage[keys.CASE_REVIEW_COOKIES],
    storage[keys.HOME_COOKIES],
  );

export const isStoredTokenSameAs = (
  token: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
): boolean => {
  const json = storage[keys.WMA_JSON];
  if (!json) {
    return false;
  }
  try {
    return JSON.parse(json).Token === token;
  } catch {
    return false;
  }
};

// A source value is only worth propagating to the sibling apps if it actually
// holds auth. OutSystems can re-persist an emptied ClientVar as the literal
// string "undefined" (e.g. after a failed post-SSO CMS session check), and an
// unset key reads back as the JS value undefined — neither must be fanned out.
const isUsableValue = (value: string | undefined): value is string =>
  !!value && value !== "undefined";

export const syncOsAuth = (
  currentUrl: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => {
  // Match case-insensitively: OutSystems hands the same logical page back under
  // different casing depending on the navigation (the CMS→OS handover returns to
  // lowercase /casework/home, in-app links use /Casework/Home). A case-sensitive
  // switch would silently no-op on the lowercase entry points.
  const app = new URLPattern({ pathname: "/:app{/*}?" })
    .exec(currentUrl)
    ?.pathname.groups["app"]?.toLowerCase();

  const copyToOtherApps = (
    jsonKey: keyof Pick<
      CmsAuthStorageKeys,
      "WMA_JSON" | "CASE_REVIEW_JSON" | "HOME_JSON"
    >,
    cookiesKey: keyof Pick<
      CmsAuthStorageKeys,
      "WMA_COOKIES" | "CASE_REVIEW_COOKIES" | "HOME_COOKIES"
    >,
  ) => {
    // Guard each copy on its own source: never let a blank/"undefined" source
    // overwrite a sibling app's still-valid auth. Without this, OutSystems
    // blanking the active app's ClientVar would fan out and wipe the others.
    const json = storage[keys[jsonKey]];
    if (isUsableValue(json)) {
      storage[keys.WMA_JSON] =
        storage[keys.CASE_REVIEW_JSON] =
        storage[keys.HOME_JSON] =
          json;
    }

    const cookies = storage[keys[cookiesKey]];
    if (isUsableValue(cookies)) {
      storage[keys.WMA_COOKIES] =
        storage[keys.CASE_REVIEW_COOKIES] =
        storage[keys.HOME_COOKIES] =
          cookies;
    }
  };

  switch (app) {
    case "workmanagementapp":
      copyToOtherApps("WMA_JSON", "WMA_COOKIES");
      break;
    case "casereview":
      copyToOtherApps("CASE_REVIEW_JSON", "CASE_REVIEW_COOKIES");
      break;
    case "casework_blocks":
    case "casework":
      copyToOtherApps("HOME_JSON", "HOME_COOKIES");
      break;
  }
};

export const setCmsSessionHint = (
  cmsSessionHint: CmsSessionHint,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => (storage[keys.HOME_IS_FROM_PROXY] = String(cmsSessionHint.isProxySession));
