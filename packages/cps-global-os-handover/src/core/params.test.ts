import { describe, test, expect } from "@jest/globals";
import { stripParams, setParams, createUrlWithParams } from "./params";

describe("stripParams", () => {
  test("removes and returns single parameter", () => {
    const url = new URL("https://example.com?foo=bar&baz=qux");
    const [value] = stripParams(url, "foo");
    
    expect(value).toBe("bar");
    expect(url.searchParams.has("foo")).toBe(false);
    expect(url.searchParams.get("baz")).toBe("qux");
  });

  test("removes and returns multiple parameters", () => {
    const url = new URL("https://example.com?foo=bar&baz=qux&test=value");
    const [foo, baz, test] = stripParams(url, "foo", "baz", "test");
    
    expect(foo).toBe("bar");
    expect(baz).toBe("qux");
    expect(test).toBe("value");
    expect(url.search).toBe("");
  });

  test("returns empty string for non-existent parameter", () => {
    const url = new URL("https://example.com?foo=bar");
    const [value] = stripParams(url, "nonexistent");
    
    expect(value).toBe("");
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("handles mixed existing and non-existing parameters", () => {
    const url = new URL("https://example.com?foo=bar");
    const [foo, missing] = stripParams(url, "foo", "missing");

    expect(foo).toBe("bar");
    expect(missing).toBe("");
    expect(url.search).toBe("");
  });

  test("returns first value when parameter is repeated", () => {
    const url = new URL("https://example.com?foo=bar&foo=baz");
    const [value] = stripParams(url, "foo");

    expect(value).toBe("bar");
    expect(url.searchParams.has("foo")).toBe(false);
  });

  test("removes all instances of repeated parameter", () => {
    const url = new URL("https://example.com?foo=first&other=value&foo=second&foo=third");
    const [value] = stripParams(url, "foo");

    expect(value).toBe("first");
    expect(url.searchParams.has("foo")).toBe(false);
    expect(url.searchParams.get("other")).toBe("value");
    expect(url.searchParams.getAll("foo")).toEqual([]);
  });
});

describe("setParams", () => {
  test("adds single parameter to URL", () => {
    const url = new URL("https://example.com");
    setParams(url, { foo: "bar" });
    
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("adds multiple parameters to URL", () => {
    const url = new URL("https://example.com");
    setParams(url, { foo: "bar", baz: "qux" });
    
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("baz")).toBe("qux");
  });

  test("overwrites existing parameters", () => {
    const url = new URL("https://example.com?foo=old");
    setParams(url, { foo: "new" });
    
    expect(url.searchParams.get("foo")).toBe("new");
  });

  test("preserves other parameters", () => {
    const url = new URL("https://example.com?existing=value");
    setParams(url, { foo: "bar" });

    expect(url.searchParams.get("existing")).toBe("value");
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("replaces all instances when parameter is repeated", () => {
    const url = new URL("https://example.com?foo=first&foo=second&foo=third");
    setParams(url, { foo: "new" });

    expect(url.searchParams.get("foo")).toBe("new");
    expect(url.searchParams.getAll("foo")).toEqual(["new"]);
  });
});

describe("createUrlWithParams", () => {
  test("creates URL with single parameter", () => {
    const url = createUrlWithParams("https://example.com", { foo: "bar" });
    
    expect(url.origin).toBe("https://example.com");
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("creates URL with multiple parameters", () => {
    const url = createUrlWithParams("https://example.com/path", {
      foo: "bar",
      baz: "qux",
      test: "value",
    });
    
    expect(url.pathname).toBe("/path");
    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("baz")).toBe("qux");
    expect(url.searchParams.get("test")).toBe("value");
  });

  test("preserves existing path and parameters", () => {
    const url = createUrlWithParams("https://example.com/path?existing=value", {
      foo: "bar",
    });
    
    expect(url.pathname).toBe("/path");
    expect(url.searchParams.get("existing")).toBe("value");
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("handles special characters in parameters", () => {
    const url = createUrlWithParams("https://example.com", {
      url: "https://other.com/path",
      special: "value with spaces",
    });

    expect(url.searchParams.get("url")).toBe("https://other.com/path");
    expect(url.searchParams.get("special")).toBe("value with spaces");
  });

  test("replaces repeated parameters with single value", () => {
    const url = createUrlWithParams("https://example.com?foo=first&foo=second", {
      foo: "new",
    });

    expect(url.searchParams.get("foo")).toBe("new");
    expect(url.searchParams.getAll("foo")).toEqual(["new"]);
  });
});