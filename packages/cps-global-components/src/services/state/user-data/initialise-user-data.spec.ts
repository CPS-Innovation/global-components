import { Config } from "cps-global-configuration";
import { FoundContext } from "../../context/FoundContext";
import { CorrelationIds } from "../../correlation/CorrelationIds";
import { GetToken } from "../../auth/GetToken";
import { Result } from "../../../utils/Result";
import { initialiseUserData } from "./initialise-user-data";
import { UserData, UserDataHint } from "./UserData";

const mockFetch = jest.fn();
global.fetch = mockFetch;

const validUserData: UserData = {
  userId: 42,
  selectedCpsAreaId: 7,
  homeUnit: { unitId: 10, unit: "UnitX", areaId: 3, area: "AreaY", areaGroupId: 1, areaGroup: "GroupZ" },
  allocatedUnits: [],
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
    const freshHint: Result<UserDataHint> = { found: true, result: { timestamp: Date.now(), userData: validUserData } };
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
    const staleHint: Result<UserDataHint> = { found: true, result: { timestamp: 0, userData: validUserData } };
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
    expect(setUserDataHint).toHaveBeenCalledWith(validUserData);
    expect(register).toHaveBeenCalledWith({ userDataHint: { found: true, result: expect.objectContaining({ userData: validUserData }) } });
  });

  it("should store only schema-defined fields, stripping any extras from the API response", async () => {
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

    expect(setUserDataHint).toHaveBeenCalledWith(validUserData);
    const stored = setUserDataHint.mock.calls[0][0];
    expect(stored).not.toHaveProperty("email");
    expect(stored).not.toHaveProperty("displayName");
    expect(stored.homeUnit).not.toHaveProperty("extraUnitField");
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
    expect(setUserDataHint).toHaveBeenCalledWith(validUserData);
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
