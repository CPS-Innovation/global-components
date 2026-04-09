const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeArgs = () => ({
  register: jest.fn(),
  registerCorrelationIdsWithAnalytics: jest.fn(),
});

describe("initialiseCorrelationIds", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it("should return scriptLoadCorrelationId equal to navigationCorrelationId on first call", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");

    const result = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();

    expect(result.scriptLoadCorrelationId).toBe(result.navigationCorrelationId);
  });

  it("should return valid UUIDs", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");

    const result = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();

    expect(result.scriptLoadCorrelationId).toMatch(UUID_REGEX);
    expect(result.navigationCorrelationId).toMatch(UUID_REGEX);
  });

  it("should keep scriptLoadCorrelationId the same on subsequent calls", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");

    const firstResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();
    const secondResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();
    const thirdResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();

    expect(secondResult.scriptLoadCorrelationId).toBe(firstResult.scriptLoadCorrelationId);
    expect(thirdResult.scriptLoadCorrelationId).toBe(firstResult.scriptLoadCorrelationId);
  });

  it("should generate a new navigationCorrelationId on each call", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");

    const firstResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();
    const secondResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();
    const thirdResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();

    expect(secondResult.navigationCorrelationId).not.toBe(firstResult.navigationCorrelationId);
    expect(thirdResult.navigationCorrelationId).not.toBe(secondResult.navigationCorrelationId);
    expect(thirdResult.navigationCorrelationId).not.toBe(firstResult.navigationCorrelationId);
  });

  it("should have navigationCorrelationId differ from scriptLoadCorrelationId on subsequent calls", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");

    freshInitialise(makeArgs()).initialiseCorrelationIdsForContext(); // First call sets scriptLoadCorrelationId
    const secondResult = freshInitialise(makeArgs()).initialiseCorrelationIdsForContext();

    expect(secondResult.navigationCorrelationId).not.toBe(secondResult.scriptLoadCorrelationId);
  });

  it("should call register with correlationIds", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");
    const args = makeArgs();

    const result = freshInitialise(args).initialiseCorrelationIdsForContext();

    expect(args.register).toHaveBeenCalledWith({ correlationIds: result });
  });

  it("should call registerCorrelationIdsWithAnalytics with correlationIds", () => {
    const { initialiseCorrelationIds: freshInitialise } = require("./initialise-correlation-ids");
    const args = makeArgs();

    const result = freshInitialise(args).initialiseCorrelationIdsForContext();

    expect(args.registerCorrelationIdsWithAnalytics).toHaveBeenCalledWith(result);
  });
});
