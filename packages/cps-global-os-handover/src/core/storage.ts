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

export const syncOsAuth = (
  currentUrl: string,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => {
  const app = new URLPattern({ pathname: "/:app{/*}?" }).exec(currentUrl)
    ?.pathname.groups["app"];

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
    storage[keys.WMA_JSON] =
      storage[keys.CASE_REVIEW_JSON] =
      storage[keys.HOME_JSON] =
        storage[keys[jsonKey]];

    storage[keys.WMA_COOKIES] =
      storage[keys.CASE_REVIEW_COOKIES] =
      storage[keys.HOME_COOKIES] =
        storage[keys[cookiesKey]];
  };

  switch (app) {
    case "WorkManagementApp":
      copyToOtherApps("WMA_JSON", "WMA_COOKIES");
      break;
    case "CaseReview":
      copyToOtherApps("CASE_REVIEW_JSON", "CASE_REVIEW_COOKIES");
      break;
    case "Casework_Blocks":
    case "Casework":
      copyToOtherApps("HOME_JSON", "HOME_COOKIES");
      break;
  }
};

export const setCmsSessionHint = (
  cmsSessionHint: CmsSessionHint,
  storage: Storage,
  keys: CmsAuthStorageKeys,
) => (storage[keys.HOME_IS_FROM_PROXY] = String(cmsSessionHint.isProxySession));
