import { Config } from "cps-global-configuration";
import { Build } from "../../store/store";
import { FoundContext } from "../context/FoundContext";
import { CorrelationIds } from "../correlation/CorrelationIds";
import { AuthResult } from "../auth/AuthResult";
import { AnalyticsEvent } from "./analytics-event";

const mockTrackPageView = jest.fn();
const mockTrackException = jest.fn();
const mockTrackEvent = jest.fn();
const mockAddTelemetryInitializer = jest.fn();
const mockLoadAppInsights = jest.fn();

jest.mock("@microsoft/applicationinsights-web", () => ({
  ApplicationInsights: jest.fn().mockImplementation(() => ({
    trackPageView: mockTrackPageView,
    trackException: mockTrackException,
    trackEvent: mockTrackEvent,
    addTelemetryInitializer: mockAddTelemetryInitializer,
    loadAppInsights: mockLoadAppInsights,
  })),
}));

import { initialiseAiAnalytics } from "./initialise-ai-analytics";

const makeProps = (overrides?: Partial<{ window: Window; config: Config; build: Build }>) => ({
  window: globalThis.window,
  config: { APP_INSIGHTS_CONNECTION_STRING: "InstrumentationKey=test", ENVIRONMENT: "test" } as Config,
  build: { version: "1.0.0" } as unknown as Build,
  ...overrides,
});

const makeContext = (): FoundContext => ({
  found: { type: "found" },
  contextIds: { caseId: "123" },
}) as unknown as FoundContext;

const makeCorrelationIds = (): CorrelationIds => ({
  scriptLoadCorrelationId: "script-123",
  navigationCorrelationId: "nav-456",
});

describe("initialiseAiAnalytics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when no connection string", () => {
    it("should return no-op methods", () => {
      const result = initialiseAiAnalytics({
        ...makeProps(),
        config: { APP_INSIGHTS_CONNECTION_STRING: "", ENVIRONMENT: "test" } as Config,
      });

      expect(result.trackPageView).toBeDefined();
      expect(result.trackException).toBeDefined();
      expect(result.trackEvent).toBeDefined();
      expect(result.registerAuth).toBeDefined();
      expect(result.registerCorrelationIds).toBeDefined();
      expect(mockLoadAppInsights).not.toHaveBeenCalled();
    });
  });

  describe("registerAuth", () => {
    it("should include auth values in trackPageView after registering an authenticated user", () => {
      const { registerAuth, trackPageView } = initialiseAiAnalytics(makeProps());

      registerAuth({ isAuthed: true, username: "alice", name: "Alice", groups: [], objectId: "obj-1" });
      trackPageView({ context: makeContext(), correlationIds: makeCorrelationIds() });

      const properties = mockTrackPageView.mock.calls[0][0].properties;
      expect(properties).toMatchObject({ IsAuthed: true, Username: "alice" });
    });

    it("should include auth values in trackPageView after registering an unauthenticated user", () => {
      const { registerAuth, trackPageView } = initialiseAiAnalytics(makeProps());

      registerAuth({ isAuthed: false, knownErrorType: "Unknown", reason: "test" } as AuthResult);
      trackPageView({ context: makeContext(), correlationIds: makeCorrelationIds() });

      const properties = mockTrackPageView.mock.calls[0][0].properties;
      expect(properties).toMatchObject({ IsAuthed: false });
      expect(properties).not.toHaveProperty("Username");
    });

    it("should not include auth values in trackPageView before registerAuth is called", () => {
      const { trackPageView } = initialiseAiAnalytics(makeProps());

      trackPageView({ context: makeContext(), correlationIds: makeCorrelationIds() });

      const properties = mockTrackPageView.mock.calls[0][0].properties;
      expect(properties).not.toHaveProperty("IsAuthed");
      expect(properties).not.toHaveProperty("Username");
    });

    it("should include auth values in trackException after registering", () => {
      const { registerAuth, trackException } = initialiseAiAnalytics(makeProps());

      registerAuth({ isAuthed: true, username: "bob", name: "Bob", groups: [], objectId: "obj-2" });
      trackException(new Error("boom"));

      const properties = mockTrackException.mock.calls[0][1].properties;
      expect(properties).toMatchObject({ IsAuthed: true, Username: "bob" });
    });
  });

  describe("registerCorrelationIds", () => {
    it("should include correlation ids in analytics events after registering", () => {
      const { registerCorrelationIds } = initialiseAiAnalytics(makeProps());
      const ids = makeCorrelationIds();

      registerCorrelationIds(ids);

      const event = new AnalyticsEvent({ name: "loaded", componentName: "test-component" });
      window.dispatchEvent(event);

      const properties = mockTrackEvent.mock.calls[0][0].properties;
      expect(properties).toMatchObject({
        componentName: "test-component",
        scriptLoadCorrelationId: "script-123",
        navigationCorrelationId: "nav-456",
      });
    });

    it("should not include correlation ids in analytics events before registering", () => {
      initialiseAiAnalytics(makeProps());

      const event = new AnalyticsEvent({ name: "loaded", componentName: "test-component" });
      window.dispatchEvent(event);

      const properties = mockTrackEvent.mock.calls[0][0].properties;
      expect(properties).not.toHaveProperty("scriptLoadCorrelationId");
    });
  });

  describe("trackPageView", () => {
    it("should capitalize property keys", () => {
      const { trackPageView } = initialiseAiAnalytics(makeProps());

      trackPageView({ context: makeContext(), correlationIds: makeCorrelationIds() });

      const properties = mockTrackPageView.mock.calls[0][0].properties;
      expect(properties).toHaveProperty("Environment", "test");
      expect(properties).toHaveProperty("Build");
      expect(properties).toHaveProperty("Context");
      expect(properties).toHaveProperty("CorrelationIds");
    });
  });

  describe("trackException", () => {
    it("should capitalize property keys", () => {
      const { trackException } = initialiseAiAnalytics(makeProps());

      trackException(new Error("boom"));

      const [exceptionArg, propsArg] = mockTrackException.mock.calls[0];
      expect(exceptionArg.exception.message).toBe("boom");
      expect(propsArg.properties).toHaveProperty("Environment", "test");
      expect(propsArg.properties).toHaveProperty("Build");
    });
  });
});
