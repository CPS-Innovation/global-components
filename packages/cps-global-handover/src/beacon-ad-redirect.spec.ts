import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { beaconAdRedirect, buildBeaconUrl } from "./beacon-ad-redirect";

const mockFetch = jest.fn<(input: unknown, init?: RequestInit) => Promise<unknown>>();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

// Helper: parse the path-segment-encoded k/v pairs back into a record. Used by
// the assertions below — mirrors what a log consumer would do to extract the
// telemetry from the URL.
const parseBeaconPath = (url: string): Record<string, string> => {
  const path = new URL(url).pathname;
  const match = path.match(/\/ad-redirect-beacon\/(.+)$/);
  if (!match) {
    return {};
  }
  const segments = match[1]!.split("/").map(decodeURIComponent);
  const result: Record<string, string> = {};
  for (let i = 0; i < segments.length; i += 2) {
    if (segments[i + 1] !== undefined) {
      result[segments[i]!] = segments[i + 1]!;
    }
  }
  return result;
};

describe("buildBeaconUrl", () => {
  test("resolves the beacon endpoint as a sibling of the bundle's .js URL", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris-qa-notprod.cps.gov.uk/global-components/test/auth-handover.js"),
      "success",
      { "auth-hint-object-id": "abc" },
    );

    expect(new URL(url).pathname).toMatch(
      /^\/global-components\/test\/ad-redirect-beacon\//,
    );
  });

  test("encodes outcome and payload keys as path segments", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
      "failure",
      { "auth-hint-object-id": "obj-123", "error-code": "AADSTS50011", reason: "redirect_uri mismatch" },
    );

    const params = parseBeaconPath(url);
    expect(params.outcome).toBe("failure");
    expect(params["auth-hint-object-id"]).toBe("obj-123");
    expect(params["error-code"]).toBe("AADSTS50011");
    expect(params.reason).toBe("redirect_uri mismatch");
  });

  test("skips undefined payload values rather than encoding them as 'undefined'", () => {
    const url = buildBeaconUrl(
      new URL("https://polaris.cps.gov.uk/global-components/prod/auth-handover.js"),
      "success",
      { "auth-hint-object-id": "obj-1", "error-code": undefined },
    );

    expect(parseBeaconPath(url)["error-code"]).toBeUndefined();
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
