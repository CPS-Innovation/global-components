import { describe, test, expect, beforeEach } from "@jest/globals";
import { storeAuth, isStoredAuthCurrent, syncOsAuth } from "./storage";

describe("storage", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    global.localStorage = {
      clear: jest.fn(),
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn(),
    };
  });

  describe("storeAuth", () => {
    test("stores cookies in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123; auth=token456";
      const token = "jwt-token-789";

      storeAuth(cookies, token);

      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(cookies);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(cookies);
      expect(localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"]).toBe(cookies);
    });

    test("stores JSON auth values in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123";
      const token = "jwt-token";

      // Mock Date to get consistent ISO string
      const mockDate = new Date("2024-01-15T10:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => mockDate);

      storeAuth(cookies, token);

      const expectedJson = JSON.stringify({
        Cookies: cookies,
        Token: token,
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$JSONString"]).toBe(expectedJson);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$CmsAuthValues"]).toBe(expectedJson);
      expect(localStorage["$OS_Users$Casework_Blocks$ClientVars$JSONString"]).toBe(expectedJson);
    });

    test("overwrites existing values", () => {
      // Set initial values
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "old-cookie";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "old-cookie";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "old-cookie";

      const newCookies = "new-cookie=value";
      const newToken = "new-token";

      storeAuth(newCookies, newToken);

      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(newCookies);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(newCookies);
      expect(localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"]).toBe(newCookies);
    });
  });

  describe("isStoredAuthCurrent", () => {
    test("returns true when all cookies match", () => {
      const cookies = "sessionid=abc123; auth=token456";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(true);
    });

    test("returns true when cookies match but are in different order", () => {
      const incomingCookies = "auth=token456; sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "sessionid=abc123; auth=token456";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "auth=token456; sessionid=abc123";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "sessionid=abc123; auth=token456";

      const result = isStoredAuthCurrent(incomingCookies);

      expect(result).toBe(true);
    });

    test("returns false when WMA cookies don't match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different-cookie";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(false);
    });

    test("returns false when CaseReview cookies don't match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different-cookie";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(false);
    });

    test("returns false when localStorage values are undefined", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = undefined;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = undefined;
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = undefined;

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(false);
    });

    test("returns false when one localStorage value is undefined", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = undefined;
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = cookies;

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(false);
    });

    test("returns false when neither localStorage values match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different1";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different2";
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "different3";

      const result = isStoredAuthCurrent(cookies);

      expect(result).toBe(false);
    });

    test("returns false when HOME cookies don't match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$Casework_Blocks$ClientVars$Cookies"] = "different-cookie";

      const result = isStoredAuthCurrent(cookies);

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
      localStorage[WMA_JSON] = wmaJson;
      localStorage[WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/", localStorage);

      expect(localStorage[WMA_JSON]).toBe(wmaJson);
      expect(localStorage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(localStorage[HOME_JSON]).toBe(wmaJson);
      expect(localStorage[WMA_COOKIES]).toBe(wmaCookies);
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(localStorage[HOME_COOKIES]).toBe(wmaCookies);
    });

    test("copies CaseReview auth values to all other apps", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      const caseReviewCookies = "cr-cookies";
      localStorage[CASE_REVIEW_JSON] = caseReviewJson;
      localStorage[CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/", localStorage);

      expect(localStorage[WMA_JSON]).toBe(caseReviewJson);
      expect(localStorage[CASE_REVIEW_JSON]).toBe(caseReviewJson);
      expect(localStorage[HOME_JSON]).toBe(caseReviewJson);
      expect(localStorage[WMA_COOKIES]).toBe(caseReviewCookies);
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe(caseReviewCookies);
      expect(localStorage[HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("copies Casework_Blocks (HOME) auth values to all other apps", () => {
      const homeJson = '{"Cookies":"home-cookies","Token":"home-token"}';
      const homeCookies = "home-cookies";
      localStorage[HOME_JSON] = homeJson;
      localStorage[HOME_COOKIES] = homeCookies;

      syncOsAuth("https://example.com/Casework_Blocks/", localStorage);

      expect(localStorage[WMA_JSON]).toBe(homeJson);
      expect(localStorage[CASE_REVIEW_JSON]).toBe(homeJson);
      expect(localStorage[HOME_JSON]).toBe(homeJson);
      expect(localStorage[WMA_COOKIES]).toBe(homeCookies);
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe(homeCookies);
      expect(localStorage[HOME_COOKIES]).toBe(homeCookies);
    });

    test("does not modify storage when URL does not match any known app", () => {
      localStorage[WMA_JSON] = "wma-json";
      localStorage[WMA_COOKIES] = "wma-cookies";
      localStorage[CASE_REVIEW_JSON] = "cr-json";
      localStorage[CASE_REVIEW_COOKIES] = "cr-cookies";
      localStorage[HOME_JSON] = "home-json";
      localStorage[HOME_COOKIES] = "home-cookies";

      syncOsAuth("https://example.com/UnknownApp/", localStorage);

      expect(localStorage[WMA_JSON]).toBe("wma-json");
      expect(localStorage[WMA_COOKIES]).toBe("wma-cookies");
      expect(localStorage[CASE_REVIEW_JSON]).toBe("cr-json");
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe("cr-cookies");
      expect(localStorage[HOME_JSON]).toBe("home-json");
      expect(localStorage[HOME_COOKIES]).toBe("home-cookies");
    });

    test("does not modify storage when URL has no app path", () => {
      localStorage[WMA_JSON] = "wma-json";
      localStorage[WMA_COOKIES] = "wma-cookies";
      localStorage[CASE_REVIEW_JSON] = "cr-json";
      localStorage[CASE_REVIEW_COOKIES] = "cr-cookies";
      localStorage[HOME_JSON] = "home-json";
      localStorage[HOME_COOKIES] = "home-cookies";

      syncOsAuth("https://example.com/", localStorage);

      expect(localStorage[WMA_JSON]).toBe("wma-json");
      expect(localStorage[WMA_COOKIES]).toBe("wma-cookies");
      expect(localStorage[CASE_REVIEW_JSON]).toBe("cr-json");
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe("cr-cookies");
      expect(localStorage[HOME_JSON]).toBe("home-json");
      expect(localStorage[HOME_COOKIES]).toBe("home-cookies");
    });

    test("overwrites existing values in other apps when syncing from WorkManagementApp", () => {
      localStorage[WMA_JSON] = "new-wma-json";
      localStorage[WMA_COOKIES] = "new-wma-cookies";
      localStorage[CASE_REVIEW_JSON] = "old-cr-json";
      localStorage[CASE_REVIEW_COOKIES] = "old-cr-cookies";
      localStorage[HOME_JSON] = "old-home-json";
      localStorage[HOME_COOKIES] = "old-home-cookies";

      syncOsAuth("https://example.com/WorkManagementApp/", localStorage);

      expect(localStorage[CASE_REVIEW_JSON]).toBe("new-wma-json");
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe("new-wma-cookies");
      expect(localStorage[HOME_JSON]).toBe("new-wma-json");
      expect(localStorage[HOME_COOKIES]).toBe("new-wma-cookies");
    });

    test("handles URL with query parameters and fragments", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      localStorage[WMA_JSON] = wmaJson;
      localStorage[WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/?foo=bar#section", localStorage);

      expect(localStorage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(localStorage[HOME_JSON]).toBe(wmaJson);
    });

    test("syncs when URL has nested paths after app name", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies"}';
      const caseReviewCookies = "cr-cookies";
      localStorage[CASE_REVIEW_JSON] = caseReviewJson;
      localStorage[CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/some/nested/path", localStorage);

      expect(localStorage[WMA_JSON]).toBe(caseReviewJson);
      expect(localStorage[WMA_COOKIES]).toBe(caseReviewCookies);
      expect(localStorage[HOME_JSON]).toBe(caseReviewJson);
      expect(localStorage[HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("syncs WorkManagementApp with deep nested path and query params", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      localStorage[WMA_JSON] = wmaJson;
      localStorage[WMA_COOKIES] = wmaCookies;

      syncOsAuth(
        "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&IsFromTasks=true",
        localStorage
      );

      expect(localStorage[CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(localStorage[CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(localStorage[HOME_JSON]).toBe(wmaJson);
      expect(localStorage[HOME_COOKIES]).toBe(wmaCookies);
    });
  });
});