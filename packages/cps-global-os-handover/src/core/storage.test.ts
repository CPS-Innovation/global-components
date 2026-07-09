import { describe, test, expect, beforeEach } from "@jest/globals";
import { CmsAuthStorageKeys } from "cps-global-configuration";
import {
  storeAuth,
  isStoredAuthCurrent,
  isStoredTokenSameAs,
  syncOsAuth,
  setCmsSessionHint,
} from "./storage";

const keys: CmsAuthStorageKeys = {
  WMA_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  WMA_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  CASE_REVIEW_JSON: "$OS_Users$CaseReview$ClientVars$CmsAuthValues",
  CASE_REVIEW_COOKIES: "$OS_Users$CaseReview$ClientVars$Cookies",
  HOME_JSON: "$OS_Users$Casework_Blocks$ClientVars$JSONString",
  HOME_COOKIES: "$OS_Users$Casework_Blocks$ClientVars$Cookies",
  HOME_IS_FROM_PROXY: "$OS_Users$Casework_Blocks$ClientVars$IsFromProxy",
};

describe("storage", () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
  });

  describe("storeAuth", () => {
    test("stores cookies in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123; auth=token456";
      const token = "jwt-token-789";

      storeAuth(cookies, token, storage as unknown as Storage, keys);

      expect(storage[keys.WMA_COOKIES]).toBe(cookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(cookies);
      expect(storage[keys.HOME_COOKIES]).toBe(cookies);
    });

    test("stores JSON auth values in WMA, CaseReview, and HOME localStorage keys", () => {
      const cookies = "sessionid=abc123";
      const token = "jwt-token";

      const mockDate = new Date("2024-01-15T10:00:00.000Z");
      jest.spyOn(global, "Date").mockImplementation(() => mockDate);

      storeAuth(cookies, token, storage as unknown as Storage, keys);

      const expectedJson = JSON.stringify({
        Cookies: cookies,
        Token: token,
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      expect(storage[keys.WMA_JSON]).toBe(expectedJson);
      expect(storage[keys.CASE_REVIEW_JSON]).toBe(expectedJson);
      expect(storage[keys.HOME_JSON]).toBe(expectedJson);
    });

    test("overwrites existing values", () => {
      storage[keys.WMA_COOKIES] = "old-cookie";
      storage[keys.CASE_REVIEW_COOKIES] = "old-cookie";
      storage[keys.HOME_COOKIES] = "old-cookie";

      const newCookies = "new-cookie=value";
      const newToken = "new-token";

      storeAuth(newCookies, newToken, storage as unknown as Storage, keys);

      expect(storage[keys.WMA_COOKIES]).toBe(newCookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(newCookies);
      expect(storage[keys.HOME_COOKIES]).toBe(newCookies);
    });
  });

  describe("isStoredAuthCurrent", () => {
    test("returns true when all cookies match", () => {
      const cookies = "sessionid=abc123; auth=token456";
      storage[keys.WMA_COOKIES] = cookies;
      storage[keys.CASE_REVIEW_COOKIES] = cookies;
      storage[keys.HOME_COOKIES] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(true);
    });

    test("returns true when cookies match but are in different order", () => {
      const incomingCookies = "auth=token456; sessionid=abc123";
      storage[keys.WMA_COOKIES] = "sessionid=abc123; auth=token456";
      storage[keys.CASE_REVIEW_COOKIES] = "auth=token456; sessionid=abc123";
      storage[keys.HOME_COOKIES] = "sessionid=abc123; auth=token456";

      const result = isStoredAuthCurrent(incomingCookies, storage as unknown as Storage, keys);

      expect(result).toBe(true);
    });

    test("returns false when CaseReview cookies don't match", () => {
      const cookies = "sessionid=abc123";
      storage[keys.WMA_COOKIES] = cookies;
      storage[keys.CASE_REVIEW_COOKIES] = "different-cookie";
      storage[keys.HOME_COOKIES] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(false);
    });

    test("returns false when localStorage values are undefined", () => {
      const cookies = "sessionid=abc123";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(false);
    });

    test("returns false when one localStorage value is undefined", () => {
      const cookies = "sessionid=abc123";
      storage[keys.WMA_COOKIES] = cookies;
      storage[keys.HOME_COOKIES] = cookies;

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(false);
    });

    test("returns false when neither localStorage values match", () => {
      const cookies = "sessionid=abc123";
      storage[keys.WMA_COOKIES] = "different1";
      storage[keys.CASE_REVIEW_COOKIES] = "different2";
      storage[keys.HOME_COOKIES] = "different3";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(false);
    });

    test("returns false when HOME cookies don't match", () => {
      const cookies = "sessionid=abc123";
      storage[keys.WMA_COOKIES] = cookies;
      storage[keys.CASE_REVIEW_COOKIES] = cookies;
      storage[keys.HOME_COOKIES] = "different-cookie";

      const result = isStoredAuthCurrent(cookies, storage as unknown as Storage, keys);

      expect(result).toBe(false);
    });
  });

  describe("syncOsAuth", () => {
    test("copies WorkManagementApp auth values to all other apps", () => {
      const wmaJson = '{"Cookies":"wma-cookies","Token":"wma-token"}';
      const wmaCookies = "wma-cookies";
      storage[keys.WMA_JSON] = wmaJson;
      storage[keys.WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe(wmaJson);
      expect(storage[keys.CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[keys.HOME_JSON]).toBe(wmaJson);
      expect(storage[keys.WMA_COOKIES]).toBe(wmaCookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(storage[keys.HOME_COOKIES]).toBe(wmaCookies);
    });

    test("copies CaseReview auth values to all other apps", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      const caseReviewCookies = "cr-cookies";
      storage[keys.CASE_REVIEW_JSON] = caseReviewJson;
      storage[keys.CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe(caseReviewJson);
      expect(storage[keys.CASE_REVIEW_JSON]).toBe(caseReviewJson);
      expect(storage[keys.HOME_JSON]).toBe(caseReviewJson);
      expect(storage[keys.WMA_COOKIES]).toBe(caseReviewCookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(caseReviewCookies);
      expect(storage[keys.HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("copies Casework_Blocks (HOME) auth values to all other apps", () => {
      const homeJson = '{"Cookies":"home-cookies","Token":"home-token"}';
      const homeCookies = "home-cookies";
      storage[keys.HOME_JSON] = homeJson;
      storage[keys.HOME_COOKIES] = homeCookies;

      syncOsAuth("https://example.com/Casework_Blocks/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe(homeJson);
      expect(storage[keys.CASE_REVIEW_JSON]).toBe(homeJson);
      expect(storage[keys.HOME_JSON]).toBe(homeJson);
      expect(storage[keys.WMA_COOKIES]).toBe(homeCookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(homeCookies);
      expect(storage[keys.HOME_COOKIES]).toBe(homeCookies);
    });

    test("copies Casework (new HOME location) auth values to all other apps", () => {
      const homeJson = '{"Cookies":"home-cookies","Token":"home-token"}';
      const homeCookies = "home-cookies";
      storage[keys.HOME_JSON] = homeJson;
      storage[keys.HOME_COOKIES] = homeCookies;

      syncOsAuth("https://example.com/Casework/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe(homeJson);
      expect(storage[keys.CASE_REVIEW_JSON]).toBe(homeJson);
      expect(storage[keys.HOME_JSON]).toBe(homeJson);
      expect(storage[keys.WMA_COOKIES]).toBe(homeCookies);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(homeCookies);
      expect(storage[keys.HOME_COOKIES]).toBe(homeCookies);
    });

    test("does not modify storage when URL does not match any known app", () => {
      storage[keys.WMA_JSON] = "wma-json";
      storage[keys.WMA_COOKIES] = "wma-cookies";
      storage[keys.CASE_REVIEW_JSON] = "cr-json";
      storage[keys.CASE_REVIEW_COOKIES] = "cr-cookies";

      syncOsAuth("https://example.com/UnknownApp/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe("wma-json");
      expect(storage[keys.WMA_COOKIES]).toBe("wma-cookies");
      expect(storage[keys.CASE_REVIEW_JSON]).toBe("cr-json");
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("cr-cookies");
    });

    test("does not modify storage when URL has no app path", () => {
      storage[keys.WMA_JSON] = "wma-json";
      storage[keys.WMA_COOKIES] = "wma-cookies";
      storage[keys.CASE_REVIEW_JSON] = "cr-json";
      storage[keys.CASE_REVIEW_COOKIES] = "cr-cookies";

      syncOsAuth("https://example.com/", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe("wma-json");
      expect(storage[keys.WMA_COOKIES]).toBe("wma-cookies");
      expect(storage[keys.CASE_REVIEW_JSON]).toBe("cr-json");
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("cr-cookies");
    });

    test("overwrites existing values in other apps when syncing from WorkManagementApp", () => {
      storage[keys.WMA_JSON] = "new-wma-json";
      storage[keys.WMA_COOKIES] = "new-wma-cookies";
      storage[keys.CASE_REVIEW_JSON] = "old-cr-json";
      storage[keys.CASE_REVIEW_COOKIES] = "old-cr-cookies";

      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe("new-wma-json");
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("new-wma-cookies");
      expect(storage[keys.HOME_JSON]).toBe("new-wma-json");
      expect(storage[keys.HOME_COOKIES]).toBe("new-wma-cookies");
    });

    test("handles URL with query parameters and fragments", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      storage[keys.WMA_JSON] = wmaJson;
      storage[keys.WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/WorkManagementApp/?foo=bar#section", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[keys.HOME_JSON]).toBe(wmaJson);
    });

    test("syncs when URL has nested paths after app name", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies"}';
      const caseReviewCookies = "cr-cookies";
      storage[keys.CASE_REVIEW_JSON] = caseReviewJson;
      storage[keys.CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CaseReview/some/nested/path", storage as unknown as Storage, keys);

      expect(storage[keys.WMA_JSON]).toBe(caseReviewJson);
      expect(storage[keys.WMA_COOKIES]).toBe(caseReviewCookies);
      expect(storage[keys.HOME_JSON]).toBe(caseReviewJson);
      expect(storage[keys.HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("syncs lowercase /casework/home (CMS→OS handover return URL)", () => {
      // The handover always returns to a lowercase path; the match must be
      // case-insensitive or sync silently no-ops on that entry point.
      const homeJson = '{"Cookies":"home-cookies","Token":"home-token"}';
      const homeCookies = "home-cookies";
      storage[keys.HOME_JSON] = homeJson;
      storage[keys.HOME_COOKIES] = homeCookies;

      syncOsAuth("https://example.com/casework/home?IsFromCMS=True", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe(homeJson);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(homeCookies);
    });

    test("syncs lowercase /workmanagementapp", () => {
      const wmaJson = '{"Cookies":"wma-cookies","Token":"wma-token"}';
      const wmaCookies = "wma-cookies";
      storage[keys.WMA_JSON] = wmaJson;
      storage[keys.WMA_COOKIES] = wmaCookies;

      syncOsAuth("https://example.com/workmanagementapp/CaseOverview", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(wmaCookies);
    });

    test("syncs mixed-case /CaseReview regardless of casing", () => {
      const caseReviewJson = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      const caseReviewCookies = "cr-cookies";
      storage[keys.CASE_REVIEW_JSON] = caseReviewJson;
      storage[keys.CASE_REVIEW_COOKIES] = caseReviewCookies;

      syncOsAuth("https://example.com/CASEREVIEW/x", storage as unknown as Storage, keys);

      expect(storage[keys.HOME_JSON]).toBe(caseReviewJson);
      expect(storage[keys.HOME_COOKIES]).toBe(caseReviewCookies);
    });

    test("does not overwrite sibling apps when source JSON is the string 'undefined'", () => {
      // Repro of the home-page-unauth wipe: OutSystems blanks the active app's
      // ClientVar to "undefined" after a failed post-SSO session check; sync
      // must not fan that blank out over CaseReview's still-valid auth.
      storage[keys.HOME_JSON] = "undefined";
      storage[keys.HOME_COOKIES] = "undefined";
      storage[keys.CASE_REVIEW_JSON] = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      storage[keys.CASE_REVIEW_COOKIES] = "cr-cookies";

      syncOsAuth("https://example.com/Casework/Home", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe('{"Cookies":"cr-cookies","Token":"cr-token"}');
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("cr-cookies");
    });

    test("does not overwrite sibling apps when source values are unset", () => {
      storage[keys.CASE_REVIEW_JSON] = '{"Cookies":"cr-cookies","Token":"cr-token"}';
      storage[keys.CASE_REVIEW_COOKIES] = "cr-cookies";

      // app="WorkManagementApp" → source is WMA_JSON/WMA_COOKIES, both unset.
      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_JSON]).toBe('{"Cookies":"cr-cookies","Token":"cr-token"}');
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("cr-cookies");
    });

    test("copies cookies even when source JSON is blank, and vice versa", () => {
      // The two are guarded independently — a usable cookies source still
      // propagates even if the JSON source happens to be blank.
      storage[keys.WMA_JSON] = "undefined";
      storage[keys.WMA_COOKIES] = "wma-cookies";

      syncOsAuth("https://example.com/WorkManagementApp/", storage as unknown as Storage, keys);

      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe("wma-cookies");
      expect(storage[keys.HOME_COOKIES]).toBe("wma-cookies");
      // JSON source was blank → CaseReview JSON left untouched (undefined here).
      expect(storage[keys.CASE_REVIEW_JSON]).toBeUndefined();
    });

    test("syncs WorkManagementApp with deep nested path and query params", () => {
      const wmaJson = '{"Cookies":"wma-cookies"}';
      const wmaCookies = "wma-cookies";
      storage[keys.WMA_JSON] = wmaJson;
      storage[keys.WMA_COOKIES] = wmaCookies;

      syncOsAuth(
        "https://cps-dev.outsystemsenterprise.com/WorkManagementApp/CaseOverview?CaseId=123&IsFromTasks=true",
        storage as unknown as Storage,
        keys,
      );

      expect(storage[keys.CASE_REVIEW_JSON]).toBe(wmaJson);
      expect(storage[keys.CASE_REVIEW_COOKIES]).toBe(wmaCookies);
      expect(storage[keys.HOME_JSON]).toBe(wmaJson);
      expect(storage[keys.HOME_COOKIES]).toBe(wmaCookies);
    });
  });

  describe("isStoredTokenSameAs", () => {
    test("returns true when stored Token field matches incoming token", () => {
      storage[keys.WMA_JSON] = JSON.stringify({
        Cookies: "c",
        Token: "abc-123",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      expect(isStoredTokenSameAs("abc-123", storage as unknown as Storage, keys)).toBe(true);
    });

    test("returns false when stored Token field differs from incoming token", () => {
      storage[keys.WMA_JSON] = JSON.stringify({
        Cookies: "c",
        Token: "old-token",
        ExpiryTime: "2024-01-15T10:00:00.000Z",
      });

      expect(isStoredTokenSameAs("new-token", storage as unknown as Storage, keys)).toBe(false);
    });

    test("returns false when no JSON has been stored yet", () => {
      expect(isStoredTokenSameAs("anything", storage as unknown as Storage, keys)).toBe(false);
    });

    test("returns false when stored JSON is malformed", () => {
      storage[keys.WMA_JSON] = "{not valid json";

      expect(isStoredTokenSameAs("anything", storage as unknown as Storage, keys)).toBe(false);
    });

    test("returns false when stored JSON has no Token field", () => {
      storage[keys.WMA_JSON] = JSON.stringify({ Cookies: "c", ExpiryTime: "x" });

      expect(isStoredTokenSameAs("anything", storage as unknown as Storage, keys)).toBe(false);
    });

    test("returns true when both incoming and stored token are empty strings", () => {
      storage[keys.WMA_JSON] = JSON.stringify({ Cookies: "c", Token: "", ExpiryTime: "x" });

      expect(isStoredTokenSameAs("", storage as unknown as Storage, keys)).toBe(true);
    });
  });

  describe("setCmsSessionHint", () => {
    test("stores isProxySession as string in HOME_IS_FROM_PROXY key", () => {
      setCmsSessionHint(
        { cmsDomains: ["example.com"], isProxySession: true, handoverEndpoint: null },
        storage as unknown as Storage,
        keys,
      );

      expect(storage[keys.HOME_IS_FROM_PROXY]).toBe("true");
    });

    test("stores false when isProxySession is false", () => {
      setCmsSessionHint(
        { cmsDomains: ["example.com"], isProxySession: false, handoverEndpoint: null },
        storage as unknown as Storage,
        keys,
      );

      expect(storage[keys.HOME_IS_FROM_PROXY]).toBe("false");
    });
  });
});
