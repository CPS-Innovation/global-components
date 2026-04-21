import { initialiseUserDataHint } from "./initialise-user-data-hint";
import { UserDataHint, UserDataHintPayload } from "./UserData";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();

const validHintPayload: UserDataHintPayload = {
  userId: 42,
  areaId: 3,
  area: "AreaY",
  hasViewNationalChargingTasksRight: false,
  countSensitiveUnits: 0,
  countNotSensitiveUnits: 0,
};

describe("initialiseUserDataHint", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/user-data-hint";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should GET the hint from state and register it", async () => {
    const hint: UserDataHint = { timestamp: 123, userData: validHintPayload };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(hint) });

    const { userDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining({ credentials: "include", cache: "no-cache" }));
    expect(userDataHint).toEqual({ found: true, result: hint });
    expect(mockRegister).toHaveBeenCalledWith({ userDataHint: { found: true, result: hint } });
  });

  it("should return not-found when the fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));

    const { userDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    expect(userDataHint.found).toBe(false);
    expect(mockRegister).toHaveBeenCalledWith({ userDataHint: expect.objectContaining({ found: false }) });
  });

  it("setUserDataHint should PUT the wrapped hint with a fresh timestamp", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const before = Date.now();
    const trackException = jest.fn();

    const { setUserDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true, path: "/state/user-data-hint" }) });
    setUserDataHint(validHintPayload, trackException);

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
    expect(putBody.userData).toEqual(validHintPayload);
    expect(putBody.timestamp).toBeGreaterThanOrEqual(before);
    expect(trackException).not.toHaveBeenCalled();
  });

  it("setUserDataHint should call trackException when the PUT fails", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const trackException = jest.fn();

    const { setUserDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockRejectedValue(new Error("network boom"));
    setUserDataHint(validHintPayload, trackException);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(trackException).toHaveBeenCalledWith(expect.any(Error), { type: "state", code: "state-user-data-hint-set" });
  });

  it("setUserDataHint should call trackException when the PUT returns a non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(null) });
    const trackException = jest.fn();

    const { setUserDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Server Error" });
    setUserDataHint(validHintPayload, trackException);

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(trackException).toHaveBeenCalledWith(expect.any(Error), { type: "state", code: "state-user-data-hint-set" });
  });
});
