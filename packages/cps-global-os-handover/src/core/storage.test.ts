import { describe, test, expect, beforeEach } from "@jest/globals";
import {
  storeAuth,
  isStoredAuthCurrent,
  syncOsAuth,
  setCmsSessionHint,
} from "./storage";

describe("storage", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
  });

  describe("storeAuth", () => {
    test("stores cookies in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123; auth=token456";
      const token = "jwt-token-789";

      storeAuth(cookies, token, storage as unknown as Storage);

      expect(storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(cookies);
      expect(storage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(cookies);
      expect(storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"]).toBe(cookies);
    });

    test("stores JSON auth values in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123";
      const token = "jwt-token";

      // Mock Date to get consistent ISO string
      const mockDate = new Date("2024-01-15T10:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => mockDate);

      storeAuth(cookies, token, storage as unknown as Storage);

      const expectedJson = JSON.stringify({
        Cookies: cookies,
        Token: token,
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      expect(storage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]).toBe(expectedJson);
      expect(storage["$OS_Users$CaseReview$ClientVars$CmsAuthValues"]).toBe(expectedJson);
      expect(storage["$OS_Users$Casework_Blocks$ClientVars$JSONString"]).toBe(expectedJson);
    });

    test("overwrites existing values", () => {
      // Set initial values
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "old-cookie";
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = "old-cookie";
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "old-cookie";

      const newCookies = "new-cookie=value";
      const newToken = "new-token";

      storeAuth(newCookies, newToken, storage as unknown as Storage);

      expect(storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(newCookies);
      expect(storage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(newCookies);
      expect(storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"]).toBe(newCookies);
    });
  });

  describe("isStoredAuthCurrent", () => {
    test("returns true when all cookies match", () => {
      const cookies = "sessionid=abc123; auth=token456";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(true);
    });

    test("returns true when cookies match but are in different order", () => {
      const incomingCookies = "auth=token456; sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "sessionid=abc123; auth=token456";
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = "auth=token456; sessionid=abc123";
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "sessionid=abc123; auth=token456";

      const result = isStoredAuthCurrent(incomingCookies, storage as unknown as Storage);

      expect(result).toBe(true);
    });

    test("returns false when WMA cookies don't match", () => {
      const cookies = "sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different-cookie";
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });

    test("returns false when CaseReview cookies don't match", () => {
      const cookies = "sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different-cookie";
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });

    test("returns false when localStorage values are undefined", () => {
      const cookies = "sessionid=abc123";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });

    test("returns false when one localStorage value is undefined", () => {
      const cookies = "sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });

    test("returns false when neither localStorage values match", () => {
      const cookies = "sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different1";
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different2";
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "different3";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });

    test("returns false when HOME cookies don't match", () => {
      const cookies = "sessionid=abc123";
      storage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      storage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "different-cookie";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage);

      expect(result).toBe(false);
    });
  });

  describe("syncOsAuth", () => {
    const WMA_JSON = "$OS_Users$WorkManagementApp$ClientVars$JSONString";
    const WMA_COOKIES = "$OS_Users$WorkManagementApp$ClientVars$Cookies";
    const CASE_REVIEW_JSON = "$OS_Users$CaseReview$ClientVars$CmsAuthValues";
    const CASE_REVIEW_COOKIES = "$OS_Users$CaseReview$ClientVars$Cookies";
    const HOME_JSON = "$OS_Users$Casework_Blocks$ClientVars$JSONString";
    const HOME_COOKIES = "$OS_Users$Casework_Blocks$ClientVars$Cookies";

    test("copies WorkManagementApp auth values to all other apps", () => {
      const wmaJson = '{"Cookies":"wma-cookies","Token":"wma-token"}';
      const wmaCookies = "wma-cookies";
      storage[WMA_JSON] = wmaJson;
      storage[WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe(wmaJson);
      expect(storage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[HOME_JSON]).toBe(wmaJson);
      expect(storage[WMA_COOKIES]).toBe(wmaCookies);
      expect(storage[CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(storage[HOME_COOKIES]).toBe(wmaCookies);
    });

    test("copies CaseReview auth values to all other apps", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      const caseReviewCookies = "cr-cookies";
      storage[CASE_REVIEW_JSON] = caseReviewJson;
      storage[CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe(caseReviewJson);
      expect(storage[CASE_REVIEW_JSON]).toBe(caseReviewJson);
      expect(storage[HOME_JSON]).toBe(caseReviewJson);
      expect(storage[WMA_COOKIES]).toBe(caseReviewCookies);
      expect(storage[CASE_REVIEW_COOKIES]).toBe(caseReviewCookies);
      expect(storage[HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("copies Casework_Blocks (HOME) auth values to all other apps", () => {
      const homeJson = '{"Cookies":"home-cookies","Token":"home-token"}';
      const homeCookies = "home-cookies";
      storage[HOME_JSON] = homeJson;
      storage[HOME_COOKIES] = homeCookies;

      syncOsAuth("https://example.com/Casework_Blocks/", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe(homeJson);
      expect(storage[CASE_REVIEW_JSON]).toBe(homeJson);
      expect(storage[HOME_JSON]).toBe(homeJson);
      expect(storage[WMA_COOKIES]).toBe(homeCookies);
      expect(storage[CASE_REVIEW_COOKIES]).toBe(homeCookies);
      expect(storage[HOME_COOKIES]).toBe(homeCookies);
    });

    test("does not modify storage when URL does not match any known app", () => {
      storage[WMA_JSON] = "wma-json";
      storage[WMA_COOKIES] = "wma-cookies";
      storage[CASE_REVIEW_JSON] = "cr-json";
      storage[CASE_REVIEW_COOKIES] = "cr-cookies";
      storage[HOME_JSON] = "home-json";
      storage[HOME_COOKIES] = "home-cookies";

      syncOsAuth("https://example.com/UnknownApp/", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe("wma-json");
      expect(storage[WMA_COOKIES]).toBe("wma-cookies");
      expect(storage[CASE_REVIEW_JSON]).toBe("cr-json");
      expect(storage[CASE_REVIEW_COOKIES]).toBe("cr-cookies");
      expect(storage[HOME_JSON]).toBe("home-json");
      expect(storage[HOME_COOKIES]).toBe("home-cookies");
    });

    test("does not modify storage when URL has no app path", () => {
      storage[WMA_JSON] = "wma-json";
      storage[WMA_COOKIES] = "wma-cookies";
      storage[CASE_REVIEW_JSON] = "cr-json";
      storage[CASE_REVIEW_COOKIES] = "cr-cookies";
      storage[HOME_JSON] = "home-json";
      storage[HOME_COOKIES] = "home-cookies";

      syncOsAuth("https://example.com/", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe("wma-json");
      expect(storage[WMA_COOKIES]).toBe("wma-cookies");
      expect(storage[CASE_REVIEW_JSON]).toBe("cr-json");
      expect(storage[CASE_REVIEW_COOKIES]).toBe("cr-cookies");
      expect(storage[HOME_JSON]).toBe("home-json");
      expect(storage[HOME_COOKIES]).toBe("home-cookies");
    });

    test("overwrites existing values in other apps when syncing from WorkManagementApp", () => {
      storage[WMA_JSON] = "new-wma-json";
      storage[WMA_COOKIES] = "new-wma-cookies";
      storage[CASE_REVIEW_JSON] = "old-cr-json";
      storage[CASE_REVIEW_COOKIES] = "old-cr-cookies";
      storage[HOME_JSON] = "old-home-json";
      storage[HOME_COOKIES] = "old-home-cookies";

      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage);

      expect(storage[CASE_REVIEW_JSON]).toBe("new-wma-json");
      expect(storage[CASE_REVIEW_COOKIES]).toBe("new-wma-cookies");
      expect(storage[HOME_JSON]).toBe("new-wma-json");
      expect(storage[HOME_COOKIES]).toBe("new-wma-cookies");
    });

    test("handles URL with query parameters and fragments", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      storage[WMA_JSON] = wmaJson;
      storage[WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/?foo=bar#section", storage as unknown as Storage);

      expect(storage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[HOME_JSON]).toBe(wmaJson);
    });

    test("syncs when URL has nested paths after app name", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies"}';
      const caseReviewCookies = "cr-cookies";
      storage[CASE_REVIEW_JSON] = caseReviewJson;
      storage[CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/some/nested/path", storage as unknown as Storage);

      expect(storage[WMA_JSON]).toBe(caseReviewJson);
      expect(storage[WMA_COOKIES]).toBe(caseReviewCookies);
      expect(storage[HOME_JSON]).toBe(caseReviewJson);
      expect(storage[HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("syncs WorkManagementApp with deep nested path and query params", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      storage[WMA_JSON] = wmaJson;
      storage[WMA_COOKIES] = wmaCookies;

      syncOsAuth(
        "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&IsFromTasks=true",
        storage as unknown as Storage,
      );

      expect(storage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(storage[HOME_JSON]).toBe(wmaJson);
      expect(storage[HOME_COOKIES]).toBe(wmaCookies);
    });
  });

  describe("setCmsSessionHint", () => {
    test("stores isProxySession as string in HOME_IS_FROM_PROXY key", () => {
      setCmsSessionHint(
        { cmsDomains: ["example.com"], isProxySession: true, handoverEndpoint: null },
        storage as unknown as Storage,
      );

      expect(storage["$OS_Users$Casework_Blocks$ClientVars$IsFromProxy"]).toBe("true");
    });

    test("stores false when isProxySession is false", () => {
      setCmsSessionHint(
        { cmsDomains: ["example.com"], isProxySession: false, handoverEndpoint: null },
        storage as unknown as Storage,
      );

      expect(storage["$OS_Users$Casework_Blocks$ClientVars$IsFromProxy"]).toBe("false");
    });
  });
});
