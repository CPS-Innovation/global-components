import { describe, test, expect } from "@jest/globals";
import { createOutboundUrl } from "./create-outbound-url";

describe("createOutboundUrl", () => {
  test("creates correct outbound URL with stage and return parameters", () => {
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl: "https://example.com/target",
    });

    const url = new URL(result);
    expect(url.searchParams.get("stage")).toBe("os-outbound");
    expect(url.searchParams.get("r")).toBe("https://example.com/target");
    expect(url.origin + url.pathname).toBe(
      "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html"
    );
  });

  test("preserves existing query parameters in handover URL", () => {
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?existing=param",
      targetUrl: "https://example.com/target",
    });

    const url = new URL(result);
    expect(url.searchParams.get("existing")).toBe("param");
    expect(url.searchParams.get("stage")).toBe("os-outbound");
    expect(url.searchParams.get("r")).toBe("https://example.com/target");
  });

  test("handles target URL with query parameters", () => {
    const targetUrl = "https://example.com/page?foo=bar&baz=qux";
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const url = new URL(result);
    expect(url.searchParams.get("r")).toBe(targetUrl);
  });

  test("handles target URL with hash fragment", () => {
    const targetUrl = "https://example.com/page#section";
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const url = new URL(result);
    expect(url.searchParams.get("r")).toBe(targetUrl);
  });

  test("handles complex target URL with path, query, and hash", () => {
    const targetUrl = "https://example.com/path/to/resource?query=value#hash";
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html",
      targetUrl,
    });

    const url = new URL(result);
    expect(url.searchParams.get("r")).toBe(targetUrl);
    expect(url.searchParams.get("stage")).toBe("os-outbound");
  });

  test("overwrites existing stage parameter in handover URL", () => {
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?stage=old-stage",
      targetUrl: "https://example.com/target",
    });

    const url = new URL(result);
    expect(url.searchParams.get("stage")).toBe("os-outbound");
    expect(url.searchParams.get("r")).toBe("https://example.com/target");
  });

  test("overwrites existing r parameter in handover URL", () => {
    const result = createOutboundUrl({
      handoverUrl: "https://cps-dev.outsystemsenterprise.com/AuthHandover/index.html?r=old-target",
      targetUrl: "https://example.com/new-target",
    });

    const url = new URL(result);
    expect(url.searchParams.get("r")).toBe("https://example.com/new-target");
    expect(url.searchParams.get("stage")).toBe("os-outbound");
  });
});