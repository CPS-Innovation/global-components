/**
 * The token seam.
 *
 * Separate from case-locking-presence.spec.ts because this is the one thing that
 * file cannot cover: every test there injects a hubFactory, so the real one — the
 * only consumer of getAccessToken — is never built. Until 2026-09-01 that gap is
 * where a hardcoded, long-expired JWT sat and shipped in the bundle.
 *
 * Mocking @microsoft/signalr lets us read back the options the builder was handed,
 * which is where accessTokenFactory lives.
 */
const mockWithUrl = jest.fn();

jest.mock("@microsoft/signalr", () => {
  const builder: Record<string, unknown> = {};
  builder.withUrl = (...args: unknown[]) => {
    mockWithUrl(...args);
    return builder;
  };
  builder.withAutomaticReconnect = () => builder;
  builder.build = () => ({ __fakeConnection: true });
  return {
    HubConnectionBuilder: jest.fn(() => builder),
    HttpTransportType: { WebSockets: 1, ServerSentEvents: 2, LongPolling: 4 },
  };
});

import { makeHubFactory, buildSectionId } from "./case-locking-presence";

// The accessTokenFactory the hub was configured with.
const tokenFactoryFrom = (): (() => Promise<string>) => {
  const [, options] = mockWithUrl.mock.calls[0] as [string, { accessTokenFactory: () => Promise<string> }];
  return options.accessTokenFactory;
};

describe("the presence access token", () => {
  beforeEach(() => {
    mockWithUrl.mockClear();
  });

  it("is fetched from the supplied source, not baked into the bundle", async () => {
    makeHubFactory(async () => "a-real-token")("https://example.test/hub");
    await expect(tokenFactoryFrom()()).resolves.toBe("a-real-token");
  });

  it("is requested lazily, per connection attempt — not once at construction", async () => {
    const getAccessToken = jest.fn<Promise<string | null>, []>().mockResolvedValue("t");
    makeHubFactory(getAccessToken)("https://example.test/hub");

    // Building the connection must not have asked for a token yet: SignalR calls
    // the factory on connect AND on every reconnect, which is what lets an expired
    // token be replaced without rebuilding anything.
    expect(getAccessToken).not.toHaveBeenCalled();

    await tokenFactoryFrom()();
    await tokenFactoryFrom()();
    expect(getAccessToken).toHaveBeenCalledTimes(2);
  });

  it("becomes an empty string when there is no token, so no Authorization header is sent", async () => {
    // The whole point: unauthenticated is the correct failure. We are a guest
    // component that must never trigger an interactive consent prompt, and a
    // wrong-audience token would be worse than none — accepted today by the API's
    // BearerTest scheme, rejected the day real validation lands.
    makeHubFactory(async () => null)("https://example.test/hub");
    await expect(tokenFactoryFrom()()).resolves.toBe("");
  });

  it("passes the hub url through untouched", () => {
    makeHubFactory(async () => "t")("https://example.test/hub");
    expect(mockWithUrl.mock.calls[0][0]).toBe("https://example.test/hub");
  });
});

describe("buildSectionId", () => {
  // Must agree with CCPSections.sectionId in the legacy clients, or one section is
  // tracked under two names and the rosters never meet.
  it("upper-cases the kind — region codes are lower-case by local convention", () => {
    expect(buildSectionId("544545", "case")).toBe("544545:CASE");
  });

  it("carries no subject and no trailing colon for case-wide kinds", () => {
    expect(buildSectionId("544545", "CASE")).toBe("544545:CASE");
    expect(buildSectionId("544545", "CASE", null)).toBe("544545:CASE");
  });

  it("appends the subject for subject-scoped kinds", () => {
    expect(buildSectionId("544545", "victim_witness", "98765")).toBe("544545:VICTIM_WITNESS:98765");
  });
});
