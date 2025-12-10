const mockUuidv4 = jest.fn();
jest.mock("zod", () => ({
  uuidv4: () => mockUuidv4(),
}));

describe("initialiseCorrelationIds", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("should return scriptLoadCorrelationId equal to navigationCorrelationId on first call", () => {
    mockUuidv4.mockReturnValue("uuid-1");
    const { initialiseCorrelationIds } = require("./initialise-correlation-ids");

    const result = initialiseCorrelationIds();

    expect(result.scriptLoadCorrelationId).toBe("uuid-1");
    expect(result.navigationCorrelationId).toBe("uuid-1");
    expect(result.scriptLoadCorrelationId).toBe(result.navigationCorrelationId);
  });

  it("should keep scriptLoadCorrelationId the same on subsequent calls", () => {
    let uuidCounter = 0;
    mockUuidv4.mockImplementation(() => `uuid-${++uuidCounter}`);
    const { initialiseCorrelationIds } = require("./initialise-correlation-ids");

    const firstResult = initialiseCorrelationIds();
    expect(firstResult.scriptLoadCorrelationId).toBe("uuid-1");
    expect(firstResult.navigationCorrelationId).toBe("uuid-1");

    const secondResult = initialiseCorrelationIds();
    expect(secondResult.scriptLoadCorrelationId).toBe("uuid-1"); // Same as first
    expect(secondResult.navigationCorrelationId).toBe("uuid-2"); // New UUID

    const thirdResult = initialiseCorrelationIds();
    expect(thirdResult.scriptLoadCorrelationId).toBe("uuid-1"); // Still same
    expect(thirdResult.navigationCorrelationId).toBe("uuid-3"); // New UUID
  });

  it("should generate a new navigationCorrelationId on each call", () => {
    let uuidCounter = 0;
    mockUuidv4.mockImplementation(() => `uuid-${++uuidCounter}`);
    const { initialiseCorrelationIds } = require("./initialise-correlation-ids");

    initialiseCorrelationIds();
    const secondResult = initialiseCorrelationIds();
    const thirdResult = initialiseCorrelationIds();

    expect(secondResult.navigationCorrelationId).toBe("uuid-2");
    expect(thirdResult.navigationCorrelationId).toBe("uuid-3");
  });

  it("should call uuidv4 once per invocation", () => {
    mockUuidv4.mockReturnValue("test-uuid");
    const { initialiseCorrelationIds } = require("./initialise-correlation-ids");

    initialiseCorrelationIds();
    expect(mockUuidv4).toHaveBeenCalledTimes(1);

    initialiseCorrelationIds();
    expect(mockUuidv4).toHaveBeenCalledTimes(2);

    initialiseCorrelationIds();
    expect(mockUuidv4).toHaveBeenCalledTimes(3);
  });
});
