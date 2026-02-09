import { CmsSessionHint } from "cps-global-configuration";
import { areAllCookieStringsEqual } from "./are-all-cookie-strings-equal";

const localStorageKeys = {
  WMA_JSON: "$OS_Users$WorkManagementApp$ClientVars$JSONString",
  WMA_COOKIES: "$OS_Users$WorkManagementApp$ClientVars$Cookies",
  CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
  CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
  HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  HOME_IS_FROM_PROXY: "$OS_Users$Casework_Blocks$ClientVars$IsFromProxy",
};

export const storeAuth = (cookies: string, token: string, storage: Storage) => {
  const cmsAuthValuesJson = JSON.stringify({
    Cookies: cookies,
    Token: token,
    ExpiryTime: new Date().toISOString(),
  });

  storage[localStorageKeys.WMA_COOKIES] = cookies;
  storage[localStorageKeys.CASE_REVIEW_COOKIES] = cookies;
  storage[localStorageKeys.HOME_COOKIES] = cookies;
  storage[localStorageKeys.WMA_JSON] = cmsAuthValuesJson;
  storage[localStorageKeys.CASE_REVIEW_JSON] = cmsAuthValuesJson;
  storage[localStorageKeys.HOME_JSON] = cmsAuthValuesJson;
};

export const isStoredAuthCurrent = (cookies: string, storage: Storage) =>
  areAllCookieStringsEqual(
    cookies,
    storage[localStorageKeys.WMA_COOKIES],
    storage[localStorageKeys.CASE_REVIEW_COOKIES],
    storage[localStorageKeys.HOME_COOKIES],
  );

export const syncOsAuth = (currentUrl: string, storage: Storage) => {
  const app = new URLPattern({ pathname: "/:app{/*}?" }).exec(currentUrl)
    ?.pathname.groups["app"];

  const copyToOtherApps = (
    jsonKey: keyof Pick<
      typeof localStorageKeys,
      "WMA_JSON" | "CASE_REVIEW_JSON" | "HOME_JSON"
    >,
    cookiesKey: keyof Pick<
      typeof localStorageKeys,
      "WMA_COOKIES" | "CASE_REVIEW_COOKIES" | "HOME_COOKIES"
    >,
  ) => {
    storage[localStorageKeys.WMA_JSON] =
      storage[localStorageKeys.CASE_REVIEW_JSON] =
      storage[localStorageKeys.HOME_JSON] =
        storage[localStorageKeys[jsonKey]];

    storage[localStorageKeys.WMA_COOKIES] =
      storage[localStorageKeys.CASE_REVIEW_COOKIES] =
      storage[localStorageKeys.HOME_COOKIES] =
        storage[localStorageKeys[cookiesKey]];
  };

  switch (app) {
    case "WorkManagementApp":
      copyToOtherApps("WMA_JSON", "WMA_COOKIES");
      break;
    case "CaseReview":
      copyToOtherApps("CASE_REVIEW_JSON", "CASE_REVIEW_COOKIES");
      break;
    case "Casework_Blocks":
      copyToOtherApps("HOME_JSON", "HOME_COOKIES");
      break;
  }
};

export const setCmsSessionHint = (
  cmsSessionHint: CmsSessionHint,
  storage: Storage,
) =>
  (storage[localStorageKeys.HOME_IS_FROM_PROXY] = String(
    cmsSessionHint.isProxySession,
  ));
