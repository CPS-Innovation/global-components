import { createDiagnosticNetworkClient } from "./diagnostic-network-client";
import { createAdDiagnosticsCollector, AdDiagnosticsCollector } from "./ad-diagnostics-collector";

const successResponse = (body: unknown = { token: "abc" }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("createDiagnosticNetworkClient", () => {
  let fetchSpy: jest.SpyInstance;
  let collector: AdDiagnosticsCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(globalThis, "fetch");
    collector = createAdDiagnosticsCollector();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("sendGetRequestAsync", () => {
    it("should return parsed response on success", async () => {
      const body = { value: 42 };
      fetchSpy.mockResolvedValue(successResponse(body));

      const client = createDiagnosticNetworkClient(collector);
      const result = await client.sendGetRequestAsync("https://login.microsoftonline.com/token");

      expect(result.status).toBe(200);
      expect(result.body).toEqual(body);
      expect(collector.get()).toEqual({});
    });

    it("should collect diagnostics and rethrow on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Failed to fetch"));

      const client = createDiagnosticNetworkClient(collector);

      await expect(client.sendGetRequestAsync("https://login.microsoftonline.com/common/discovery/keys")).rejects.toThrow("Failed to fetch");

      const diagnostics = collector.get();
      expect(diagnostics).toMatchObject({
        fetchFailedEndpoint: "/common/discovery/keys",
        fetchErrorName: "TypeError",
        fetchErrorMessage: "Failed to fetch",
      });
    });
  });

  describe("sendPostRequestAsync", () => {
    it("should return parsed response on success", async () => {
      const body = { access_token: "xyz" };
      fetchSpy.mockResolvedValue(successResponse(body));

      const client = createDiagnosticNetworkClient(collector);
      const result = await client.sendPostRequestAsync("https://login.microsoftonline.com/oauth2/v2.0/token", {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=authorization_code&code=abc",
      });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(body);
      expect(collector.get()).toEqual({});
    });

    it("should collect diagnostics with environment info on fetch failure", async () => {
      fetchSpy.mockRejectedValue(new TypeError("Load failed"));

      const client = createDiagnosticNetworkClient(collector);

      await expect(
        client.sendPostRequestAsync("https://login.microsoftonline.com/oauth2/v2.0/token"),
      ).rejects.toThrow("Load failed");

      const diagnostics = collector.get();
      expect(diagnostics).toMatchObject({
        fetchFailedEndpoint: "/oauth2/v2.0/token",
        fetchErrorName: "TypeError",
        fetchErrorMessage: "Load failed",
      });
      expect(diagnostics).toHaveProperty("fetchNavigatorOnLine");
      expect(diagnostics).toHaveProperty("fetchDocumentHidden");
      expect(diagnostics).toHaveProperty("fetchDocumentVisibilityState");
      expect(diagnostics).toHaveProperty("fetchFailedDurationMs");
    });

    it("should handle non-Error throw values", async () => {
      fetchSpy.mockRejectedValue("network down");

      const client = createDiagnosticNetworkClient(collector);

      await expect(client.sendPostRequestAsync("https://login.microsoftonline.com/oauth2/v2.0/token")).rejects.toBe("network down");

      expect(collector.get()).toMatchObject({
        fetchErrorName: "unknown",
        fetchErrorMessage: "network down",
      });
    });

    it("should pass headers from options to fetch", async () => {
      fetchSpy.mockResolvedValue(successResponse());

      const client = createDiagnosticNetworkClient(collector);
      await client.sendPostRequestAsync("https://login.microsoftonline.com/oauth2/v2.0/token", {
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Custom": "value" },
        body: "data",
      });

      const [, init] = fetchSpy.mock.calls[0];
      expect(init.method).toBe("POST");
      expect(init.body).toBe("data");
    });
  });
});
