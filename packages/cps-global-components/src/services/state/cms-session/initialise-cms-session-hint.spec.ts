import { CmsSessionHint } from "cps-global-configuration";
import { initialiseCmsSessionHint } from "./initialise-cms-session-hint";
import { ApplicationFlags } from "../../application-flags/ApplicationFlags";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("initialiseCmsSessionHint", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/cms-session-hint";
  const defaultFlags: ApplicationFlags = { isOutSystems: false, isLocalDevelopment: false, e2eTestMode: { isE2eTestMode: false }, environment: "test" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when fetch succeeds with valid data", () => {
    const validCmsSessionHint: CmsSessionHint = {
      cmsDomains: ["cms.example.com", "cms2.example.com"],
      isProxySession: true,
      handoverEndpoint: "/api/handover",
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validCmsSessionHint),
      });
    });

    it("should call fetch with correct URL and credentials", async () => {
      await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include" });
    });

    it("should return found: true with the result", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(result).toEqual({ found: true, result: validCmsSessionHint });
    });
  });

  describe("when fetch succeeds with handoverEndpoint as null", () => {
    const cmsSessionHintWithNullEndpoint: CmsSessionHint = {
      cmsDomains: ["cms.example.com"],
      isProxySession: false,
      handoverEndpoint: null,
    };

    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(cmsSessionHintWithNullEndpoint),
      });
    });

    it("should return found: true with the result", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(result).toEqual({ found: true, result: cmsSessionHintWithNullEndpoint });
    });
  });

  describe("when fetch succeeds but response is null", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(null),
      });
    });

    it("should return found: false with an error", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(result.found).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe(`User has no state at ${expectedUrl}`);
    });
  });

  describe("when response is not ok", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
      });
    });

    it("should return found: false with response status error", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(result.found).toBe(false);
      expect(result.error?.message).toBe(`Call to ${expectedUrl} returned non-ok status code: 403 Forbidden`);
    });
  });

  describe("when fetch throws an error", () => {
    const networkError = new Error("Connection refused");

    beforeEach(() => {
      mockFetch.mockRejectedValue(networkError);
    });

    it("should return found: false with the error", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: defaultFlags });

      expect(result.found).toBe(false);
      expect(result.error).toBe(networkError);
    });
  });

  describe("when isOutSystems is truthy and environment is 'dev'", () => {
    const devFlags: ApplicationFlags = { isOutSystems: true, isLocalDevelopment: false, e2eTestMode: { isE2eTestMode: false }, environment: "dev" };

    it("should return a mock result without calling fetch", async () => {
      const result = await initialiseCmsSessionHint({ rootUrl, flags: devFlags });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.result.isProxySession).toBe(true);
      }
    });
  });
});
