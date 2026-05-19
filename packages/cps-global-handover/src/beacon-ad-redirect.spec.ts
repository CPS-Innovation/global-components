import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { beaconAdRedirect, buildBeaconUrl } from "./beacon-ad-redirect";

const mockFetch = jest.fn<(input: unknown, init?: RequestInit) => Promise<unknown>>();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

describe("buildBeaconUrl", () => {
  test("resolves the beacon endpoint as a sibling of the bundle's .js URL", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js"),
      "success",
      { "auth-hint-object-id": "abc" },
    );

    expect(new URL(url).origin + new URL(url).pathname).toBe(
      "https://polaris-qa-notprod.cps.gov.uk/global-components/test/ad-redirect-beacon",
    );
  });

  test("sets ?outcome= and folds payload keys into query string", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
      "failure",
      { "auth-hint-object-id": "obj-123", "error-code": "AADSTS50011", reason: "redirect_uri mismatch" },
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get("outcome")).toBe("failure");
    expect(parsed.searchParams.get("auth-hint-object-id")).toBe("obj-123");
    expect(parsed.searchParams.get("error-code")).toBe("AADSTS50011");
    expect(parsed.searchParams.get("reason")).toBe("redirect_uri mismatch");
  });

  test("skips undefined payload values rather than encoding them as 'undefined'", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
      "success",
      { "auth-hint-object-id": "obj-1", "error-code": undefined },
    );

    expect(new URL(url).searchParams.has("error-code")).toBe(false);
  });
});

describe("beaconAdRedirect", () => {
  test("awaits fetch with keepalive:true and credentials:omit", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    await beaconAdRedirect(
      new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
      "success",
      { "auth-hint-object-id": "obj-1" },
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = mockFetch.mock.calls[0]!;
    expect(String(calledUrl)).toContain("/ad-redirect-beacon");
    expect(init).toMatchObject({ method: "GET", keepalive: true, credentials: "omit" });
  });

  test("swallows fetch errors so beacon failure never blocks the auth flow", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    await expect(
      beaconAdRedirect(
        new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
        "failure",
        { "auth-hint-object-id": "obj-1" },
      ),
    ).resolves.toBeUndefined();
  });
});
