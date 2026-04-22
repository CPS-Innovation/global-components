import { Config } from "cps-global-configuration";
import { initialiseDiagnostics } from "./initialise-diagnostics";
import { SilentFlowDiagnostics } from "./silent-flow-diagnostics";
import * as probeModule from "./probe-iframe-load";
import { ApplicationFlags } from "../application-flags/ApplicationFlags";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();
const mockTrackEvent = jest.fn();

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

const flags: ApplicationFlags = { isOutSystems: false, e2eTestMode: { isE2eTestMode: false }, isLocalDevelopment: false, environment: "test", origin: "https://example.com" };

describe("initialiseDiagnostics", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/diagnostics/silent-flow";
  const expectedProbeStateUrl = "https://example.com/api/state/diagnostics/probe-iframe-load";
  const baseConfig = {} as Config;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("startup GET", () => {
    it("calls fetch with correct URL and credentials", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include", cache: "no-cache" });
    });

    it("registers silentFlowDiagnostics with the fetched object", async () => {
      const existing: SilentFlowDiagnostics = {
        silentFlows: [
          { time: 123, url: "https://a.example/one" },
          { time: 456, url: "https://a.example/two" },
        ],
      };
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(existing) });

      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ silentFlowDiagnostics: { found: true, result: existing } });
    });

    it("registers an empty silentFlowDiagnostics object when response is null", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });

      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ silentFlowDiagnostics: { found: true, result: { silentFlows: [] } } });
    });

    it("registers found: false when fetch fails", async () => {
      mockFetch.mockRejectedValue(new Error("network"));

      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      const registered = mockRegister.mock.calls[0][0].silentFlowDiagnostics;
      expect(registered.found).toBe(false);
    });

    it("truncates a pre-existing silentFlows longer than the configured length", async () => {
      const sevenEntries = Array.from({ length: 7 }, (_, i) => ({ time: i, url: `u${i}` }));
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: sevenEntries }) });

      initialiseDiagnostics({ window, rootUrl, flags, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 3 } as Config, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      const registered = mockRegister.mock.calls[0][0].silentFlowDiagnostics;
      expect(registered.result.silentFlows).toEqual(sevenEntries.slice(0, 3));
    });
  });

  describe("addSilentFlowDiagnostics", () => {
    it("PUTs the whole silentFlowDiagnostics object with the new entry prepended", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 100, url: "u1" }] }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/silent-flow" }) });

      addSilentFlowDiagnostics({ time: 200, url: "u2" });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          silentFlows: [
            { time: 200, url: "u2" },
            { time: 100, url: "u1" },
          ],
        }),
        credentials: "include",
      });
    });

    it("caps silentFlows at the configured length (default 5)", async () => {
      const fiveEntries = Array.from({ length: 5 }, (_, i) => ({ time: i, url: `u${i}` }));
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: fiveEntries }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/silent-flow" }) });

      addSilentFlowDiagnostics({ time: 999, url: "newest" });
      await flushPromises();

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.silentFlows).toHaveLength(5);
      expect(body.silentFlows[0]).toEqual({ time: 999, url: "newest" });
      expect(body.silentFlows[4]).toEqual({ time: 3, url: "u3" });
    });

    it("accumulates added entries across calls", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();
      mockFetch.mockClear();
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/silent-flow" }) });

      addSilentFlowDiagnostics({ time: 1, url: "a" });
      await flushPromises();
      addSilentFlowDiagnostics({ time: 2, url: "b" });
      await flushPromises();

      const lastBody = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(lastBody.silentFlows).toEqual([
        { time: 2, url: "b" },
        { time: 1, url: "a" },
      ]);
    });
  });

  describe("returned silentFlowDiagnostics object", () => {
    it("reflects the fetched data and subsequent additions via live mutation", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 1, url: "a" }] }) });

      const { silentFlowDiagnostics, addSilentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(silentFlowDiagnostics.silentFlows).toEqual([{ time: 1, url: "a" }]);

      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/diagnostics/silent-flow" }) });
      addSilentFlowDiagnostics({ time: 2, url: "b" });
      await flushPromises();

      expect(silentFlowDiagnostics.silentFlows).toEqual([
        { time: 2, url: "b" },
        { time: 1, url: "a" },
      ]);
    });

    it("starts with empty silentFlows before the startup GET resolves", () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 1, url: "a" }] }) });

      const { silentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });

      expect(silentFlowDiagnostics.silentFlows).toEqual([]);
    });
  });

  describe("when SILENT_FLOW_DIAGNOSTICS_LENGTH is 0", () => {
    it("PUTs an empty silentFlows when the startup GET returned a non-empty list", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 1, url: "a" }] }) });

      initialiseDiagnostics({ window, rootUrl, flags, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ silentFlows: [] }),
        credentials: "include",
      });
    });

    it("does not PUT when the startup GET returned an empty list", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      initialiseDiagnostics({ window, rootUrl, flags, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include", cache: "no-cache" });
    });

    it("addSilentFlowDiagnostics is a no-op", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ window, rootUrl, flags, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();
      mockFetch.mockClear();

      addSilentFlowDiagnostics({ time: 1, url: "a" });
      await flushPromises();

      expect(mockFetch).not.toHaveBeenCalled();
    });
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
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      initialiseDiagnostics({ window, rootUrl, flags, config: baseConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedProbeStateUrl, expect.anything());
    });

    it("does not run on OutSystems hosts (their CSP blocks the iframe so the probe would produce a false timeout-public)", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      initialiseDiagnostics({
        window,
        rootUrl,
        flags: { ...flags, isOutSystems: true },
        config: probeConfig,
        register: mockRegister,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();

      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalledWith(expectedProbeStateUrl, expect.anything());
    });

    it("GETs the stored diagnostic, skips the probe and does not track when a value already exists", async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url === expectedProbeStateUrl) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ outcome: "loaded", durationMs: 123, timestamp: 1 }) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });
      });

      initialiseDiagnostics({ window, rootUrl, flags, config: probeConfig, register: mockRegister, trackEvent: mockTrackEvent });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledWith(expectedProbeStateUrl, { credentials: "include", cache: "no-cache" });
      expect(probeSpy).not.toHaveBeenCalled();
      expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ name: "iframe-load-probe" }));
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });
      });

      initialiseDiagnostics({ window, rootUrl, flags, config: probeConfig, register: mockRegister, trackEvent: mockTrackEvent });
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });
      });

      initialiseDiagnostics({
        window,
        rootUrl,
        config: { ...probeConfig, PROBE_IFRAME_TIMEOUT_MS: 5000 } as Config,
        flags,
        register: mockRegister,
        trackEvent: mockTrackEvent,
      });
      await flushPromises();
      await flushPromises();

      expect(probeSpy).toHaveBeenCalledWith({ window, url: "https://blob.example/global/dev/probe-iframe-load.html", timeoutMs: 5000 });
      expect(mockTrackEvent).toHaveBeenCalledWith({ name: "iframe-load-probe", outcome: "timeout-local", durationMs: 5000 });
    });
  });
});
