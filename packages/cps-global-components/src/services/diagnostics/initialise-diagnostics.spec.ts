import { Config } from "cps-global-configuration";
import { initialiseDiagnostics } from "./initialise-diagnostics";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTrackEvent = jest.fn();

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));


describe("initialiseDiagnostics", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const baseConfig = {} as Config;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("probe-navigator-permissions", () => {
    const hostname = "test-host.example";
    const expectedNavPermsUrl = `https://example.com/api/state/diagnostics/probe-navigator-permissions/${hostname}`;

    const navPermsConfig = {
      PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS: 120,
    } as Config;

    let permissionsQuery: jest.Mock;
    let testWindow: Window;

    beforeEach(() => {
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      permissionsQuery = jest.fn().mockResolvedValue({ state: "granted" });
      testWindow = {
        location: { hostname },
        navigator: { permissions: { query: permissionsQuery } },
      } as unknown as Window;
    });

    afterEach(() => {
      (Date.now as jest.Mock).mockRestore?.();
    });

    it("does not run when PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS is unset", async () => {
      initialiseDiagnostics({ window: testWindow, rootUrl, config: baseConfig, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(permissionsQuery).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedNavPermsUrl, expect.anything());
    });

    it("does not run when PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS is 0 (kill switch)", async () => {
      initialiseDiagnostics({
        window: testWindow,
        rootUrl,
        config: { PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS: 0 } as Config,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();

      expect(permissionsQuery).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedNavPermsUrl, expect.anything());
    });

    it("skips when the stored diagnostic is within the refresh window", async () => {
      const now = 1_700_000_000_000;
      (Date.now as jest.Mock).mockReturnValue(now);
      const freshTimestamp = now - 5_000;
      mockFetch.mockImplementation((url: string) => {
        if (url === expectedNavPermsUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ timestamp: freshTimestamp, localNetworkAccessPermission: "granted" }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window: testWindow, rootUrl, config: navPermsConfig, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedNavPermsUrl, { credentials: "include", cache: "no-cache" });
      expect(permissionsQuery).not.toHaveBeenCalled();
      expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: "probe-navigator-permissions" }));
    });

    it("re-runs when the stored diagnostic is older than the refresh window", async () => {
      const now = 1_700_000_000_000;
      (Date.now as jest.Mock).mockReturnValue(now);
      const staleTimestamp = now - 121 * 60 * 1000;
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedNavPermsUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: `/state/diagnostics/probe-navigator-permissions/${hostname}` }) });
        }
        if (url === expectedNavPermsUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ timestamp: staleTimestamp, localNetworkAccessPermission: "granted" }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window: testWindow, rootUrl, config: navPermsConfig, trackEvent: mockTrackEvent });
      await flushPromises();
      await flushPromises();

      expect(permissionsQuery).toHaveBeenCalledWith({ name: "local-network-access" });
      const putCall = mockFetch.mock.calls.find(([url, init]) => url === expectedNavPermsUrl && init?.method === "PUT");
      expect(putCall).toBeDefined();
    });

    it("queries permissions, PUTs { timestamp, localNetworkAccessPermission } keyed by hostname, and fires the analytics event when no value is stored", async () => {
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedNavPermsUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: `/state/diagnostics/probe-navigator-permissions/${hostname}` }) });
        }
        if (url === expectedNavPermsUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window: testWindow, rootUrl, config: navPermsConfig, trackEvent: mockTrackEvent });
      await flushPromises();
      await flushPromises();

      expect(permissionsQuery).toHaveBeenCalledWith({ name: "local-network-access" });

      const putCall = mockFetch.mock.calls.find(([url, init]) => url === expectedNavPermsUrl && init?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(putCall![1].body)).toEqual({ timestamp: 1_700_000_000_000, localNetworkAccessPermission: "granted" });

      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: "probe-navigator-permissions",
        hostname,
        timestamp: 1_700_000_000_000,
        localNetworkAccessPermission: "granted",
      });
    });

    it("tolerates the permissions API rejecting (e.g. browser doesn't recognise 'local-network-access') — stores and tracks without the field", async () => {
      permissionsQuery.mockRejectedValue(new TypeError("unknown permission"));
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedNavPermsUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: `/state/diagnostics/probe-navigator-permissions/${hostname}` }) });
        }
        if (url === expectedNavPermsUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window: testWindow, rootUrl, config: navPermsConfig, trackEvent: mockTrackEvent });
      await flushPromises();
      await flushPromises();

      const putCall = mockFetch.mock.calls.find(([url, init]) => url === expectedNavPermsUrl && init?.method === "PUT");
      expect(putCall).toBeDefined();
      const body = JSON.parse(putCall![1].body);
      expect(body).toEqual({ timestamp: 1_700_000_000_000 });
      expect(body.localNetworkAccessPermission).toBeUndefined();

      expect(mockTrackEvent).toHaveBeenCalledWith({
        name: "probe-navigator-permissions",
        hostname,
        timestamp: 1_700_000_000_000,
        localNetworkAccessPermission: undefined,
      });
    });
  });
});
