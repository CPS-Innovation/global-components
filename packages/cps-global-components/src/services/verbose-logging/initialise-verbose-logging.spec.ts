const mockDebugAlways = jest.fn();
jest.mock("../../logging/makeConsole", () => ({
  makeConsole: () => ({
    _debug: jest.fn(),
    _debugAlways: (...args: any[]) => mockDebugAlways(...args),
    _log: jest.fn(),
    _error: jest.fn(),
    _warn: jest.fn(),
  }),
}));

// Required, not imported: Stencil's preprocessor does not hoist jest.mock above
// imports, so an import would bind the real makeConsole before the mock exists.
const { emitVerbose, resetVerboseLoggingForTests } = require("../../logging/verbose-logging") as typeof import("../../logging/verbose-logging");
const { describeVerboseLogging, initialiseVerboseLogging, isLocalBundle, VERBOSE_LOGGING_STORAGE_KEY } =
  require("./initialise-verbose-logging") as typeof import("./initialise-verbose-logging");

const LOCAL = "http://localhost:3333/build/global-components.js";
const DEPLOYED = "https://polaris-dev-notprod.cps.gov.uk/global-components/dev/global-components.js";
const PREVIEW_URL = "https://polaris-dev-notprod.cps.gov.uk/global-components/dev/preview/index.html";

const makeWindow = (stored: Record<string, string> = {}) =>
  ({
    localStorage: { getItem: (key: string) => stored[key] ?? null },
  }) as unknown as Window;

const throwingStorageWindow = () =>
  ({
    get localStorage(): Storage {
      throw new Error("SecurityError");
    },
  }) as unknown as Window;

const optedIn = () => makeWindow({ [VERBOSE_LOGGING_STORAGE_KEY]: "" });

describe("isLocalBundle", () => {
  it.each([
    [LOCAL, true],
    ["http://127.0.0.1:8080/global-components.js", true],
    ["https://abc123-3333.uks1.devtunnels.ms/global-components.js", true],
    [DEPLOYED, false],
    ["https://localhost.evil.example/global-components.js", false],
    ["not a url", false],
  ])("%s -> %s", (rootUrl, expected) => {
    expect(isLocalBundle(rootUrl)).toBe(expected);
  });
});

describe("initialiseVerboseLogging", () => {
  beforeEach(() => {
    resetVerboseLoggingForTests();
    mockDebugAlways.mockReset();
  });

  const emitted = () => {
    const emit = jest.fn();
    emitVerbose(emit);
    return emit;
  };

  it("switches on immediately for a local bundle, whatever the preview says", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: makeWindow(), rootUrl: LOCAL });
    expect(emitted()).toHaveBeenCalled();
    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(emitted()).toHaveBeenCalled();
  });

  it("switches on immediately when the localStorage key is present, whatever its value", () => {
    initialiseVerboseLogging({ window: optedIn(), rootUrl: DEPLOYED });
    expect(emitted()).toHaveBeenCalled();
  });

  it("treats unreadable localStorage as not opted in", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: throwingStorageWindow(), rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(emitted()).not.toHaveBeenCalled();
  });

  it("waits for the preview for a deployed bundle, then follows the flag", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: makeWindow(), rootUrl: DEPLOYED });
    const early = emitted();
    expect(early).not.toHaveBeenCalled();

    resolveVerboseLoggingFromPreview({ found: true, result: { verboseLogging: true } });
    expect(early).toHaveBeenCalled();
  });

  it("stays off for a deployed bundle without the flag", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: makeWindow(), rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(emitted()).not.toHaveBeenCalled();
  });

  it("stays off when the preview could not be read", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: makeWindow(), rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: false, error: new Error("nope") });
    expect(emitted()).not.toHaveBeenCalled();
  });

  it("announces the outcome once the preview is in, with the preview page beside the script", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: makeWindow(), rootUrl: DEPLOYED });
    expect(mockDebugAlways).not.toHaveBeenCalled();

    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(mockDebugAlways).toHaveBeenCalledTimes(1);
    expect(mockDebugAlways.mock.calls[0][0]).toContain("OFF");
    expect(mockDebugAlways.mock.calls[0][0]).toContain(PREVIEW_URL);
  });

  it("announces every reason it is on", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ window: optedIn(), rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: true, result: { verboseLogging: true } });
    const message = mockDebugAlways.mock.calls[0][0];
    expect(message).toContain("ON");
    expect(message).toContain(`localStorage.removeItem("${VERBOSE_LOGGING_STORAGE_KEY}")`);
    expect(message).toContain(PREVIEW_URL);
  });
});

describe("describeVerboseLogging", () => {
  it("when off, offers both ways to switch it on", () => {
    expect(describeVerboseLogging({ reasons: [], previewUrl: PREVIEW_URL })).toBe(
      `Verbose logging is OFF. To switch it on, either run localStorage.setItem("${VERBOSE_LOGGING_STORAGE_KEY}", "true") on this site and reload, or switch on "Verbose logging" at ${PREVIEW_URL}`,
    );
  });

  it("for a local bundle, just says why", () => {
    expect(describeVerboseLogging({ reasons: ["local-bundle"], previewUrl: PREVIEW_URL })).toBe(
      "Verbose logging is ON because the script is served from a local origin.",
    );
  });

  it("for the localStorage key, says how to clear it", () => {
    expect(describeVerboseLogging({ reasons: ["local-storage"], previewUrl: PREVIEW_URL })).toBe(
      `Verbose logging is ON because the localStorage key "${VERBOSE_LOGGING_STORAGE_KEY}" is set — localStorage.removeItem("${VERBOSE_LOGGING_STORAGE_KEY}") and reload to clear it.`,
    );
  });

  it("for the preview flag, says where to switch it off", () => {
    expect(describeVerboseLogging({ reasons: ["preview"], previewUrl: PREVIEW_URL })).toBe(
      `Verbose logging is ON because the "Verbose logging" preview flag is on — switch it off at ${PREVIEW_URL}.`,
    );
  });
});
