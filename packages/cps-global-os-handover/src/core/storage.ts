import { areAllCookieStringsEqual } from "./are-all-cookie-strings-equal";

const localStorageKeys = {
  WMA_JSON: "$OS_Users$WorkManagementApp$ClientVars$JSONString",
  WMA_COOKIES: "$OS_Users$WorkManagementApp$ClientVars$Cookies",
  CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
  CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
  HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
};

export const storeAuth = (cookies: string, token: string) => {
  const cmsAuthValuesJson = JSON.stringify({
    Cookies: cookies,
    Token: token,
    ExpiryTime: new Date().toISOString(),
  });

  localStorage[localStorageKeys.WMA_COOKIES] = cookies;
  localStorage[localStorageKeys.CASE_REVIEW_COOKIES] = cookies;
  localStorage[localStorageKeys.HOME_COOKIES] = cookies;
  localStorage[localStorageKeys.WMA_JSON] = cmsAuthValuesJson;
  localStorage[localStorageKeys.CASE_REVIEW_JSON] = cmsAuthValuesJson;
  localStorage[localStorageKeys.HOME_JSON] = cmsAuthValuesJson;
};

export const isStoredAuthCurrent = (cookies: string) =>
  areAllCookieStringsEqual(
    cookies,
    localStorage[localStorageKeys.WMA_COOKIES],
    localStorage[localStorageKeys.CASE_REVIEW_COOKIES],
    localStorage[localStorageKeys.HOME_COOKIES]
  );
