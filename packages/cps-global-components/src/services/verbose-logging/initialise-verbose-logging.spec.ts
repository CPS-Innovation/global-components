import { emitVerbose, resetVerboseLoggingForTests } from "../../logging/verbose-logging";
import { initialiseVerboseLogging, isLocalBundle } from "./initialise-verbose-logging";

const LOCAL = "http://localhost:3333/build/global-components.js";
const DEPLOYED = "https://polaris-dev-notprod.cps.gov.uk/global-components/dev/global-components.js";

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
  });

  const emitted = () => {
    const emit = jest.fn();
    emitVerbose(emit);
    return emit;
  };

  it("switches on immediately for a local bundle, whatever the preview says", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ rootUrl: LOCAL });
    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(emitted()).toHaveBeenCalled();
  });

  it("waits for the preview for a deployed bundle, then follows the flag", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ rootUrl: DEPLOYED });
    const early = emitted();
    expect(early).not.toHaveBeenCalled();

    resolveVerboseLoggingFromPreview({ found: true, result: { verboseLogging: true } });
    expect(early).toHaveBeenCalled();
  });

  it("stays off for a deployed bundle without the flag", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: true, result: {} });
    expect(emitted()).not.toHaveBeenCalled();
  });

  it("stays off when the preview could not be read", () => {
    const { resolveVerboseLoggingFromPreview } = initialiseVerboseLogging({ rootUrl: DEPLOYED });
    resolveVerboseLoggingFromPreview({ found: false, error: new Error("nope") });
    expect(emitted()).not.toHaveBeenCalled();
  });
});
