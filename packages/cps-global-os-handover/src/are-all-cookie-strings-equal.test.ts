import { describe, test, expect } from "@jest/globals";
import { areAllCookieStringsEqual } from "./are-all-cookie-strings-equal";

describe("sanitizedCookieString", () => {
  test("handles empty string", () => {
    expect(areAllCookieStringsEqual("", "")).toBe(true);
  });

  test("handles undefined input", () => {
    expect(areAllCookieStringsEqual(undefined as any, undefined as any)).toBe(
      true
    );
  });

  test("sorts cookie fragments alphabetically", () => {
    const cookie1 = "b=2; a=1; c=3";
    const cookie2 = "a=1; b=2; c=3";
    expect(areAllCookieStringsEqual(cookie1, cookie2)).toBe(true);
  });

  test("trims whitespace from fragments", () => {
    const cookie1 = "a=1;b=2;c=3";
    const cookie2 = "a=1; b=2; c=3";
    const cookie3 = "a=1;  b=2;  c=3";
    expect(areAllCookieStringsEqual(cookie1, cookie2, cookie3)).toBe(true);
  });

  test("handles trailing semicolons", () => {
    const cookie1 = "a=1; b=2;";
    const cookie2 = "a=1; b=2";
    expect(areAllCookieStringsEqual(cookie1, cookie2)).toBe(false);
  });

  test("handles leading semicolons", () => {
    const cookie1 = "; a=1; b=2";
    const cookie2 = "a=1; b=2";
    expect(areAllCookieStringsEqual(cookie1, cookie2)).toBe(false);
  });

  test("handles cookies with different orders", () => {
    const cookie1 = "sessionid=xyz123; userid=456; preferences=dark_mode";
    const cookie2 = "userid=456; sessionid=xyz123; preferences=dark_mode";
    const cookie3 = "preferences=dark_mode; userid=456; sessionid=xyz123";
    expect(areAllCookieStringsEqual(cookie1, cookie2, cookie3)).toBe(true);
  });
});

describe("areAllCookieStringEqual", () => {
  test("returns true for single cookie string", () => {
    expect(areAllCookieStringsEqual("a=1; b=2")).toBe(true);
  });

  test("returns true for identical cookie strings", () => {
    const cookie = "a=1; b=2; c=3";
    expect(areAllCookieStringsEqual(cookie, cookie, cookie)).toBe(true);
  });

  test("returns true for equivalent but differently ordered cookies", () => {
    expect(
      areAllCookieStringsEqual(
        "a=1; b=2; c=3",
        "b=2; c=3; a=1",
        "c=3; a=1; b=2"
      )
    ).toBe(true);
  });

  test("returns false for different cookie values", () => {
    expect(areAllCookieStringsEqual("a=1; b=2", "a=1; b=3")).toBe(false);
  });

  test("returns false for different cookie names", () => {
    expect(areAllCookieStringsEqual("a=1; b=2", "a=1; c=2")).toBe(false);
  });

  test("returns false for different number of cookies", () => {
    expect(areAllCookieStringsEqual("a=1; b=2", "a=1; b=2; c=3")).toBe(false);
  });

  test("handles empty and undefined inputs", () => {
    expect(areAllCookieStringsEqual("", "", "")).toBe(true);
    expect(areAllCookieStringsEqual(undefined as any, undefined as any)).toBe(
      true
    );
    expect(areAllCookieStringsEqual("", undefined as any)).toBe(true);
  });

  test("handles mixed valid and empty inputs", () => {
    expect(areAllCookieStringsEqual("a=1", "a=1", "")).toBe(false);
    expect(areAllCookieStringsEqual("a=1", "", "a=1")).toBe(false);
  });

  test("handles complex real-world cookie strings", () => {
    const cookie1 =
      "JSESSIONID=abc123; Path=/; HttpOnly; Secure; SameSite=Strict";
    const cookie2 =
      "Path=/; JSESSIONID=abc123; SameSite=Strict; HttpOnly; Secure";
    const cookie3 =
      "Secure; HttpOnly; Path=/; SameSite=Strict; JSESSIONID=abc123";
    expect(areAllCookieStringsEqual(cookie1, cookie2, cookie3)).toBe(true);
  });

  test("handles cookies with special characters", () => {
    const cookie1 = 'data={"user":"john","id":123}; session=abc-def_123';
    const cookie2 = 'session=abc-def_123; data={"user":"john","id":123}';
    expect(areAllCookieStringsEqual(cookie1, cookie2)).toBe(true);
  });

  test("handles cookies with URL encoded values", () => {
    const cookie1 = "redirect=%2Fhome%2Fuser; token=abc%3D%3D";
    const cookie2 = "token=abc%3D%3D; redirect=%2Fhome%2Fuser";
    expect(areAllCookieStringsEqual(cookie1, cookie2)).toBe(true);
  });

  test("returns true for no arguments", () => {
    expect(areAllCookieStringsEqual()).toBe(true);
  });

  test("handles multiple identical cookies with different spacing", () => {
    expect(
      areAllCookieStringsEqual(
        "a=1;b=2;c=3",
        "a=1; b=2; c=3",
        "a=1 ; b=2 ; c=3",
        "a=1  ;  b=2  ;  c=3"
      )
    ).toBe(true);
  });
});
