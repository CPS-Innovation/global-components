import { describe, test, expect } from "@jest/globals";
import { createOutboundUrlDirect } from "./create-outbound-url-direct";

describe("createOutboundUrlDirect", () => {
  test("creates correct URL chain with cookie handover and redirect", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl: "https://example.com/target",
    });

    const outerUrl = new URL(result);

    // The outer URL should be the cookie handover URL
    expect(outerUrl.origin + outerUrl.pathname).toBe(
      "https://os-app.example.com/cookie-handover"
    );

    // Extract the redirect URL from the outer URL
    const redirectUrl = outerUrl.searchParams.get("r");
    expect(redirectUrl).toBeTruthy();

    const innerUrl = new URL(redirectUrl!);

    // The inner URL should be the handover URL with stage and target
    expect(innerUrl.origin + innerUrl.pathname).toBe(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html"
    );
    expect(innerUrl.searchParams.get("stage")).toBe("os-cookie-return");
    expect(innerUrl.searchParams.get("r")).toBe("https://example.com/target");
  });

  test("handles target URL with query parameters", () => {
    const targetUrl = "https://example.com/page?foo=bar&baz=qux";
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("r")).toBe(targetUrl);
  });

  test("handles target URL with hash fragment", () => {
    const targetUrl = "https://example.com/page#section";
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("r")).toBe(targetUrl);
  });

  test("handles complex target URL with path, query, and hash", () => {
    const targetUrl = "https://example.com/path/to/resource?query=value#hash";
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("r")).toBe(targetUrl);
    expect(innerUrl.searchParams.get("stage")).toBe("os-cookie-return");
  });

  test("preserves existing query parameters in cookie handover URL", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover?existing=param",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl: "https://example.com/target",
    });

    const outerUrl = new URL(result);
    expect(outerUrl.searchParams.get("existing")).toBe("param");
    expect(outerUrl.searchParams.get("r")).toBeTruthy();
  });

  test("preserves existing query parameters in handover URL", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?existing=param",
      targetUrl: "https://example.com/target",
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("existing")).toBe("param");
    expect(innerUrl.searchParams.get("stage")).toBe("os-cookie-return");
    expect(innerUrl.searchParams.get("r")).toBe("https://example.com/target");
  });

  test("overwrites existing stage parameter in handover URL", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?stage=old-stage",
      targetUrl: "https://example.com/target",
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("stage")).toBe("os-cookie-return");
  });

  test("overwrites existing r parameter in both URLs", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover?r=old-redirect",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=old-target",
      targetUrl: "https://example.com/new-target",
    });

    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);

    expect(innerUrl.searchParams.get("r")).toBe("https://example.com/new-target");
    expect(redirectUrl).not.toBe("old-redirect");
  });

  test("returns string representation of final URL", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl: "https://example.com/target",
    });

    expect(typeof result).toBe("string");
    expect(result).toContain("https://os-app.example.com/cookie-handover");
    expect(result).toContain("r=");
  });

  test("creates properly URL-encoded nested redirect chain", () => {
    const targetUrl = "https://example.com/page?param=value with spaces";
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "https://os-app.example.com/cookie-handover",
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    // Should be able to parse the result without errors
    const outerUrl = new URL(result);
    const redirectUrl = outerUrl.searchParams.get("r");
    expect(redirectUrl).toBeTruthy();

    // Should be able to parse the nested URL without errors
    const innerUrl = new URL(redirectUrl!);
    const finalTarget = innerUrl.searchParams.get("r");
    expect(finalTarget).toBe(targetUrl);
  });

  test("handles URLs with different protocols", () => {
    const result = createOutboundUrlDirect({
      cookieHandoverUrl: "http://localhost:3000/cookie-handover",
      handoverUrl: "http://localhost:4000/handover",
      targetUrl: "http://localhost:5000/target",
    });

    const outerUrl = new URL(result);
    expect(outerUrl.protocol).toBe("http:");

    const redirectUrl = outerUrl.searchParams.get("r");
    const innerUrl = new URL(redirectUrl!);
    expect(innerUrl.protocol).toBe("http:");
  });
});
