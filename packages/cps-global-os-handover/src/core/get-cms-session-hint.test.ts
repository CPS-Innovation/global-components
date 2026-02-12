import { describe, test, expect, beforeEach, jest } from "@jest/globals";
import { getCmsSessionHint } from "./get-cms-session-hint";

jest.mock("./get-root-url");

import { getRootUrl } from "./get-root-url";

const mockGetRootUrl = getRootUrl as jest.MockedFunction<typeof getRootUrl>;
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe("getCmsSessionHint", () => {
  beforeEach(() => {
    mockGetRootUrl.mockReset();
    mockFetch.mockReset();
    window.fetch = mockFetch;

    if (!AbortSignal.timeout) {
      AbortSignal.timeout = (ms: number) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
      };
    }
  });

  test("fetches and returns a valid CmsSessionHint", async () => {
    mockGetRootUrl.mockReturnValue(
      "https://polaris.cps.gov.uk/global-components/prod/auth-handover.js",
    );

    const hint = {
      cmsDomains: ["example.com"],
      isProxySession: true,
      handoverEndpoint: null,
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => hint,
    } as Response);

    const result = await getCmsSessionHint();

    expect(result).toEqual(hint);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://polaris.cps.gov.uk/global-components/cms-session-hint",
      { signal: expect.any(AbortSignal) },
    );
  });

  test("throws when rootUrl is null", async () => {
    mockGetRootUrl.mockReturnValue(null);

    await expect(getCmsSessionHint()).rejects.toThrow(
      "Could not establish rootUrl",
    );
  });

  test("throws when response is not ok", async () => {
    mockGetRootUrl.mockReturnValue(
      "https://polaris.cps.gov.uk/global-components/prod/auth-handover.js",
    );

    mockFetch.mockResolvedValue({
      ok: false,
      statusText: "Internal Server Error",
    } as Response);

    await expect(getCmsSessionHint()).rejects.toThrow(
      "Error retrieving cms session hint Internal Server Error",
    );
  });

  test("throws when response fails schema validation", async () => {
    mockGetRootUrl.mockReturnValue(
      "https://polaris.cps.gov.uk/global-components/prod/auth-handover.js",
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: "shape" }),
    } as Response);

    await expect(getCmsSessionHint()).rejects.toThrow(
      "Malformed cms session hint found",
    );
  });

  test("derives session hint URL from the origin of rootUrl", async () => {
    mockGetRootUrl.mockReturnValue(
      "https://polaris-qa-notprod.cps.gov.uk/global-components/dev/auth-handover.js",
    );

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        cmsDomains: [],
        isProxySession: false,
        handoverEndpoint: "https://example.com/handover",
      }),
    } as Response);

    await getCmsSessionHint();

    expect(mockFetch).toHaveBeenCalledWith(
      "https://polaris-qa-notprod.cps.gov.uk/global-components/cms-session-hint",
      expect.anything(),
    );
  });
});
