import { Config } from "cps-global-configuration";
import { FoundContext } from "../../context/FoundContext";
import { CorrelationIds } from "../../correlation/CorrelationIds";
import { GetToken } from "cps-global-auth";
import { Result } from "../../../utils/Result";
import { initialiseUserData } from "./initialise-user-data";
import { UserData, UserDataHint, UserDataHintPayload } from "./UserData";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const validUserData: UserData = {
  userId: 42,
  selectedCpsAreaId: 7,
  homeUnit: { unitId: 10, unit: "UnitX", areaId: 3, area: "AreaY", areaGroupId: 1, areaGroup: "GroupZ" },
  allocatedUnits: [],
};

const expectedHintPayload: UserDataHintPayload = {
  userId: 42,
  areaId: 3,
  area: "AreaY",
  hasViewNationalChargingTasksRight: undefined,
  countSensitiveUnits: 0,
  countNotSensitiveUnits: 0,
};

const baseConfig: Partial<Config> = {
  GATEWAY_URL: "https://gateway.example.com",
  AD_GATEWAY_SCOPE: "scope",
  USER_DATA_REFRESH_PERIOD_MINS: 60,
};

const context: FoundContext = { found: true, preventADAndDataCalls: false } as FoundContext;
const getToken: GetToken = async () => "token-123";
const correlationIds: CorrelationIds = { navigationCorrelationId: "corr-1" } as CorrelationIds;

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

describe("initialiseUserData", () => {
  let setUserDataHint: jest.Mock;
  let trackEvent: jest.Mock;
  let trackException: jest.Mock;
  let register: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setUserDataHint = jest.fn();
    trackEvent = jest.fn();
    trackException = jest.fn();
    register = jest.fn();
  });

  it("should short-circuit when USER_DATA_REFRESH_PERIOD_MINS is 0", async () => {
    const { initialiseUserDataForContext } = initialiseUserData({
      config: { ...baseConfig, USER_DATA_REFRESH_PERIOD_MINS: 0 } as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(setUserDataHint).not.toHaveBeenCalled();
  });

  it("should short-circuit when context.preventADAndDataCalls is true", async () => {
    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({
      context: { ...context, preventADAndDataCalls: true } as FoundContext,
      getToken,
      correlationIds,
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should skip fetching when hint timestamp is fresh", async () => {
    const freshHint: Result<UserDataHint> = { found: true, result: { timestamp: Date.now(), userData: expectedHintPayload } };
    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: freshHint,
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(setUserDataHint).not.toHaveBeenCalled();
  });

  it("should fetch user-data and call setUserDataHint when hint is stale", async () => {
    const staleHint: Result<UserDataHint> = { found: true, result: { timestamp: 0, userData: expectedHintPayload } };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(validUserData) });

    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: staleHint,
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = mockFetch.mock.calls[0][0];
    expect(String(url)).toContain("/api/global-components/user-data");
    expect(setUserDataHint).toHaveBeenCalledWith(expectedHintPayload, trackException);
    expect(register).toHaveBeenCalledWith({ userDataHint: { found: true, result: expect.objectContaining({ userData: expectedHintPayload }) } });
  });

  it("should store only the compact hint payload, dropping all extras from the API response", async () => {
    const apiResponse = {
      userId: 42,
      selectedCpsAreaId: 7,
      homeUnit: {
        unitId: 10,
        unit: "UnitX",
        areaId: 3,
        area: "AreaY",
        areaGroupId: 1,
        areaGroup: "GroupZ",
        extraUnitField: "leaked",
      },
      allocatedUnits: [{ areaIsSensitive: true }, { areaIsSensitive: false }, { areaIsSensitive: false }],
      email: "user@example.com",
      displayName: "Alice",
    };
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) });

    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    const stored = setUserDataHint.mock.calls[0][0];
    expect(Object.keys(stored).sort()).toEqual(
      ["area", "areaId", "countNotSensitiveUnits", "countSensitiveUnits", "hasViewNationalChargingTasksRight", "userId"].sort(),
    );
    expect(stored.countSensitiveUnits).toBe(1);
    expect(stored.countNotSensitiveUnits).toBe(2);
    expect(stored.areaId).toBe(3);
    expect(stored.area).toBe("AreaY");
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("homeUnit");
    expect(stored).not.toHaveProperty("allocatedUnits");
  });

  it("should fetch when there is no hint", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(validUserData) });

    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(setUserDataHint).toHaveBeenCalledWith(expectedHintPayload, trackException);
  });

  it("should not update the hint when the fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "boom", json: () => Promise.resolve({}) });

    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    await initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(setUserDataHint).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("should not fetch a second time while a call is in-flight, and skips after success", async () => {
    let resolveFetch: (value: any) => void = () => {};
    mockFetch.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );

    const { initialiseUserDataForContext } = initialiseUserData({
      config: baseConfig as Config,
      userDataHint: { found: false, error: new Error("no hint") },
      setUserDataHint,
      trackEvent,
      trackException,
      register,
    });

    const first = initialiseUserDataForContext({ context, getToken, correlationIds });
    await flushPromises();
    const second = initialiseUserDataForContext({ context, getToken, correlationIds });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, json: () => Promise.resolve(validUserData) });
    await Promise.all([first, second]);
    await flushPromises();

    // Subsequent call while hint is fresh shouldn't hit the network again.
    await initialiseUserDataForContext({ context, getToken, correlationIds });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(setUserDataHint).toHaveBeenCalledTimes(1);
  });
});
