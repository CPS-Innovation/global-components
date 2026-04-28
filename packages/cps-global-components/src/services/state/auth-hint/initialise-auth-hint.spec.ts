import { initialiseAuthHint } from "./initialise-auth-hint";
import { Auth } from "cps-global-auth";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();

const validAuth: Auth = {
  isAuthed: true,
  username: "test@example.com",
  name: "Test User",
  objectId: "obj-123",
  groups: [],
};

describe("initialiseAuthHint", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/auth-hint";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should GET the hint from state and register it", async () => {
    const hint = { authResult: validAuth, timestamp: 123 };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(hint) });

    const { authHint } = await initialiseAuthHint({ rootUrl, register: mockRegister });

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ credentials: "include", cache: "no-cache" }));
    expect(authHint).toEqual({ found: true, result: hint });
    expect(mockRegister).toHaveBeenCalledWith({ authHint: { found: true, result: hint } });
  });

  it("should return not-found when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));

    const { authHint } = await initialiseAuthHint({ rootUrl, register: mockRegister });

    expect(authHint.found).toBe(false);
    expect(mockRegister).toHaveBeenCalledWith({ authHint: expect.objectContaining({ found: false }) });
  });

  it("setAuthHint should PUT the wrapped hint with a fresh timestamp", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const before = Date.now();
    const trackException = jest.fn();

    const { setAuthHint } = await initialiseAuthHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/auth-hint" }) });
    setAuthHint(validAuth, trackException);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(mockFetch).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const putBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(putBody.authResult).toEqual(validAuth);
    expect(putBody.timestamp).toBeGreaterThanOrEqual(before);
    expect(trackException).not.toHaveBeenCalled();
  });

  it("setAuthHint should call trackException when the PUT rejects", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const trackException = jest.fn();

    const { setAuthHint } = await initialiseAuthHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockRejectedValue(new Error("network boom"));
    setAuthHint(validAuth, trackException);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(trackException).toHaveBeenCalledWith(expect.any(Error), { type: "state", code: "state-auth-hint-set" });
  });

  it("setAuthHint should call trackException when the PUT returns a non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const trackException = jest.fn();

    const { setAuthHint } = await initialiseAuthHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" });
    setAuthHint(validAuth, trackException);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(trackException).toHaveBeenCalledWith(expect.any(Error), { type: "state", code: "state-auth-hint-set" });
  });
});
