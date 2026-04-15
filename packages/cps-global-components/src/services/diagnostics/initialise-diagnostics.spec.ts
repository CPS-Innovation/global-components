import { Config } from "cps-global-configuration";
import { initialiseDiagnostics } from "./initialise-diagnostics";
import { SilentFlowDiagnostics } from "./silent-flow-diagnostics";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe("initialiseDiagnostics", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/diagnostics/silent-flow";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("startup GET", () => {
    it("calls fetch with correct URL and credentials", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
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

      initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ silentFlowDiagnostics: { found: true, result: existing } });
    });

    it("registers an empty silentFlowDiagnostics object when response is null", async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });

      initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({ silentFlowDiagnostics: { found: true, result: { silentFlows: [] } } });
    });

    it("registers found: false when fetch fails", async () => {
      mockFetch.mockRejectedValue(new Error("network"));

      initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
      await flushPromises();

      const registered = mockRegister.mock.calls[0][0].silentFlowDiagnostics;
      expect(registered.found).toBe(false);
    });

    it("truncates a pre-existing silentFlows longer than the configured length", async () => {
      const sevenEntries = Array.from({ length: 7 }, (_, i) => ({ time: i, url: `u${i}` }));
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ silentFlows: sevenEntries }) });

      initialiseDiagnostics({ rootUrl, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 3 } as Config, register: mockRegister });
      await flushPromises();

      const registered = mockRegister.mock.calls[0][0].silentFlowDiagnostics;
      expect(registered.result.silentFlows).toEqual(sevenEntries.slice(0, 3));
    });
  });

  describe("addSilentFlowDiagnostics", () => {
    it("PUTs the whole silentFlowDiagnostics object with the new entry prepended", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 100, url: "u1" }] }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
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

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
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

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
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

      const { silentFlowDiagnostics, addSilentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });
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

      const { silentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: {} as Config, register: mockRegister });

      expect(silentFlowDiagnostics.silentFlows).toEqual([]);
    });
  });

  describe("when SILENT_FLOW_DIAGNOSTICS_LENGTH is 0", () => {
    it("PUTs an empty silentFlows when the startup GET returned a non-empty list", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [{ time: 1, url: "a" }] }) });

      initialiseDiagnostics({ rootUrl, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister });
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

      initialiseDiagnostics({ rootUrl, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister });
      await flushPromises();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, { credentials: "include", cache: "no-cache" });
    });

    it("addSilentFlowDiagnostics is a no-op", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ silentFlows: [] }) });

      const { addSilentFlowDiagnostics } = initialiseDiagnostics({ rootUrl, config: { SILENT_FLOW_DIAGNOSTICS_LENGTH: 0 } as Config, register: mockRegister });
      await flushPromises();
      mockFetch.mockClear();

      addSilentFlowDiagnostics({ time: 1, url: "a" });
      await flushPromises();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
