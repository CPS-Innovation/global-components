import { ApplicationFlags, Config } from "cps-global-configuration";
import { initialiseDiagnostics } from "./initialise-diagnostics";
import * as probeModule from "./probe-iframe-load";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockTrackEvent = jest.fn();

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

const flags: ApplicationFlags = { isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, isLocalDevelopment: false, environment: "test", origin: "https://example.com" };

describe("initialiseDiagnostics", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedProbeStateUrl = "https://example.com/api/state/diagnostics/probe-iframe-load";
  const baseConfig = {} as Config;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("probe-iframe-load", () => {
    let probeSpy: jest.SpyInstance;

    const probeConfig = {
      ENVIRONMENT: "dev",
      PROBE_IFRAME_BASE_URL: "https://blob.example/global",
    } as Config;

    beforeEach(() => {
      probeSpy = jest.spyOn(probeModule, "probeIframeLoad");
      jest.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    });

    afterEach(() => {
      probeSpy.mockRestore();
      (Date.now as jest.Mock).mockRestore?.();
    });

    it("does not run when PROBE_IFRAME_BASE_URL is missing", async () => {
      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedProbeStateUrl, expect.anything());
    });

    it("does not run on OutSystems hosts (their CSP blocks the iframe so the probe would produce a false timeout-public)", async () => {
      initialiseDiagnostics({
        window,
        rootUrl,
        flags: { ...flags, isOutSystems: true },
        config: probeConfig,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();

      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedProbeStateUrl, expect.anything());
    });

    it("GETs the stored diagnostic and skips the probe when the stored value is within the refresh window", async () => {
      const now = 1_700_000_000_000;
      (Date.now as jest.Mock).mockReturnValue(now);
      const freshTimestamp = now - 5_000; // 5 seconds ago, well inside the default 15-minute window
      mockFetch.mockImplementation((url: string) => {
        if (url === expectedProbeStateUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ outcome: "loaded", durationMs: 123, timestamp: freshTimestamp }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window, rootUrl, flags, config: probeConfig, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedProbeStateUrl, { credentials: "include", cache: "no-cache" });
      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: "iframe-load-probe" }));
    });

    it("re-runs the probe when the stored value is older than PROBE_IFRAME_REFRESH_PERIOD_MINS", async () => {
      const now = 1_700_000_000_000;
      (Date.now as jest.Mock).mockReturnValue(now);
      const staleTimestamp = now - 5 * 60 * 1000; // 5 minutes ago, beyond a 1-minute refresh window
      probeSpy.mockResolvedValue({ outcome: "loaded", durationMs: 200 });
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedProbeStateUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/probe-iframe-load" }) });
        }
        if (url === expectedProbeStateUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ outcome: "loaded", durationMs: 100, timestamp: staleTimestamp }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window, rootUrl, flags, config: { ...probeConfig, PROBE_IFRAME_REFRESH_PERIOD_MINS: 1 } as Config, trackEvent: mockTrackEvent });
      await flushPromises();
      await flushPromises();

      expect(probeSpy).toHaveBeenCalled();
      const putCall = mockFetch.mock.calls.find(([url, init]) => url === expectedProbeStateUrl && init?.method === "PUT");
      expect(putCall).toBeDefined();
    });

    it("does not run when PROBE_IFRAME_REFRESH_PERIOD_MINS is 0 (kill switch)", async () => {
      initialiseDiagnostics({
        window,
        rootUrl,
        flags,
        config: { ...probeConfig, PROBE_IFRAME_REFRESH_PERIOD_MINS: 0 } as Config,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();

      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedProbeStateUrl, expect.anything());
    });

    it("runs the probe, PUTs the result + timestamp, and tracks the event when no value is stored", async () => {
      probeSpy.mockResolvedValue({ outcome: "loaded", durationMs: 250 });
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedProbeStateUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/probe-iframe-load" }) });
        }
        if (url === expectedProbeStateUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({ window, rootUrl, flags, config: probeConfig, trackEvent: mockTrackEvent });
      await flushPromises();
      await flushPromises();

      expect(probeSpy).toHaveBeenCalledWith({ window, url: "https://blob.example/global/dev/probe-iframe-load.html", timeoutMs: 3000 });

      const putCall = mockFetch.mock.calls.find(([url, init]) => url === expectedProbeStateUrl && init?.method === "PUT");
      expect(putCall).toBeDefined();
      expect(JSON.parse(putCall![1].body)).toEqual({ outcome: "loaded", durationMs: 250, timestamp: 1_700_000_000_000 });

      expect(mockTrackEvent).toHaveBeenCalledWith({ name: "iframe-load-probe", outcome: "loaded", durationMs: 250 });
    });

    it("uses the configured PROBE_IFRAME_TIMEOUT_MS when provided", async () => {
      probeSpy.mockResolvedValue({ outcome: "timeout-local", durationMs: 5000 });
      mockFetch.mockImplementation((url: string, init?: any) => {
        if (url === expectedProbeStateUrl && init?.method === "PUT") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/probe-iframe-load" }) });
        }
        if (url === expectedProbeStateUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve(null) });
      });

      initialiseDiagnostics({
        window,
        rootUrl,
        config: { ...probeConfig, PROBE_IFRAME_TIMEOUT_MS: 5000 } as Config,
        flags,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();
      await flushPromises();

      expect(probeSpy).toHaveBeenCalledWith({ window, url: "https://blob.example/global/dev/probe-iframe-load.html", timeoutMs: 5000 });
      expect(mockTrackEvent).toHaveBeenCalledWith({ name: "iframe-load-probe", outcome: "timeout-local", durationMs: 5000 });
    });
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
      initialiseDiagnostics({ window: testWindow, rootUrl, flags, config: baseConfig, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(permissionsQuery).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedNavPermsUrl, expect.anything());
    });

    it("does not run when PROBE_NAVIGATOR_PERMISSIONS_REFRESH_PERIOD_MINS is 0 (kill switch)", async () => {
      initialiseDiagnostics({
        window: testWindow,
        rootUrl,
        flags,
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

      initialiseDiagnostics({ window: testWindow, rootUrl, flags, config: navPermsConfig, trackEvent: mockTrackEvent });
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

      initialiseDiagnostics({ window: testWindow, rootUrl, flags, config: navPermsConfig, trackEvent: mockTrackEvent });
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

      initialiseDiagnostics({ window: testWindow, rootUrl, flags, config: navPermsConfig, trackEvent: mockTrackEvent });
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

      initialiseDiagnostics({ window: testWindow, rootUrl, flags, config: navPermsConfig, trackEvent: mockTrackEvent });
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
