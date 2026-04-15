import { initialiseUserDataHint } from "./initialise-user-data-hint";
import { UserData, UserDataHint } from "./UserData";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockRegister = jest.fn();

const validUserData: UserData = {
  userId: 42,
  selectedCpsAreaId: 7,
  homeUnit: { unitId: 10, unit: "UnitX", areaId: 3, area: "AreaY", areaIsSensitive: false, areaGroupId: 1, areaGroup: "GroupZ" },
};

describe("initialiseUserDataHint", () => {
  const rootUrl = "https://example.com/api/global-components/";
  const expectedUrl = "https://example.com/api/state/user-data";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should GET the hint from state and register it", async () => {
    const hint: UserDataHint = { timestamp: 123, userData: validUserData };
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

    const { setUserDataHint } = await initialiseUserDataHint({ rootUrl, register: mockRegister });

    mockFetch.mockClear();
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    setUserDataHint(validUserData);

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
    expect(putBody.userData).toEqual(validUserData);
    expect(putBody.timestamp).toBeGreaterThanOrEqual(before);
  });
});
