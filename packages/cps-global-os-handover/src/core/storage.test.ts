import { describe, test, expect, beforeEach } from "@jest/globals";
import { storeAuth, isStoredAuthCurrent } from "./storage";

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
    test("stores cookies in both WMA and CaseReview localStorage keys", () => {
      const cookies = "sessionid=abc123; auth=token456";
      const token = "jwt-token-789";
      
      storeAuth(cookies, token);
      
      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(cookies);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(cookies);
    });

    test("stores JSON auth values in both WMA and CaseReview localStorage keys", () => {
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
    });

    test("overwrites existing values", () => {
      // Set initial values
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "old-cookie";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "old-cookie";
      
      const newCookies = "new-cookie=value";
      const newToken = "new-token";
      
      storeAuth(newCookies, newToken);
      
      expect(localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"]).toBe(newCookies);
      expect(localStorage["$OS_Users$CaseReview$ClientVars$Cookies"]).toBe(newCookies);
    });
  });

  describe("isStoredAuthCurrent", () => {
    test("returns true when all cookies match", () => {
      const cookies = "sessionid=abc123; auth=token456";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(true);
    });

    test("returns true when cookies match but are in different order", () => {
      const incomingCookies = "auth=token456; sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "sessionid=abc123; auth=token456";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "auth=token456; sessionid=abc123";
      
      const result = isStoredAuthCurrent(incomingCookies);
      
      expect(result).toBe(true);
    });

    test("returns false when WMA cookies don't match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different-cookie";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = cookies;
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(false);
    });

    test("returns false when CaseReview cookies don't match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different-cookie";
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(false);
    });

    test("returns false when localStorage values are undefined", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = undefined;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = undefined;
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(false);
    });

    test("returns false when one localStorage value is undefined", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = cookies;
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = undefined;
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(false);
    });

    test("returns false when neither localStorage values match", () => {
      const cookies = "sessionid=abc123";
      localStorage["$OS_Users$WorkManagementApp$ClientVars$Cookies"] = "different1";
      localStorage["$OS_Users$CaseReview$ClientVars$Cookies"] = "different2";
      
      const result = isStoredAuthCurrent(cookies);
      
      expect(result).toBe(false);
    });
  });
});