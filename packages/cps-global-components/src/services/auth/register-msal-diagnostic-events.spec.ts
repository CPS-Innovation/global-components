import { EventType, PublicClientApplication } from "@azure/msal-browser";
import { registerMsalDiagnosticEvents } from "./register-msal-diagnostic-events";
import { createAdDiagnosticsCollector, AdDiagnosticsCollector } from "./ad-diagnostics-collector";

describe("registerMsalDiagnosticEvents", () => {
  let collector: AdDiagnosticsCollector;
  let capturedCallback: (message: { eventType: string; timestamp: number; error?: unknown }) => void;
  let mockInstance: PublicClientApplication;

  beforeEach(() => {
    jest.clearAllMocks();
    collector = createAdDiagnosticsCollector();

    mockInstance = {
      addEventCallback: jest.fn((cb, _eventTypes) => {
        capturedCallback = cb;
        return "callback-id";
      }),
    } as unknown as PublicClientApplication;

    registerMsalDiagnosticEvents(mockInstance, collector);
  });

  it("should register event callback with correct event types", () => {
    expect(mockInstance.addEventCallback).toHaveBeenCalledWith(
      expect.any(Function),
      [
        EventType.SSO_SILENT_START,
        EventType.SSO_SILENT_SUCCESS,
        EventType.SSO_SILENT_FAILURE,
        EventType.ACQUIRE_TOKEN_NETWORK_START,
        EventType.LOGIN_START,
        EventType.LOGIN_SUCCESS,
        EventType.LOGIN_FAILURE,
        EventType.POPUP_OPENED,
      ],
    );
  });

  describe("ssoSilent flow", () => {
    it("should collect timings on success with full flow", () => {
      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.ACQUIRE_TOKEN_NETWORK_START, timestamp: 3000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_SUCCESS, timestamp: 3500 });

      expect(collector.get()).toEqual({
        ssoSilentTotalDurationMs: 2500,
        ssoSilentIframeDurationMs: 2000,
        ssoSilentTokenPostDurationMs: 500,
        ssoSilentOutcome: "success",
      });
    });

    it("should collect timings on failure with error code", () => {
      const error = Object.assign(new Error("post_request_failed"), { errorCode: "post_request_failed" });

      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.ACQUIRE_TOKEN_NETWORK_START, timestamp: 3000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_FAILURE, timestamp: 3200, error });

      expect(collector.get()).toEqual({
        ssoSilentTotalDurationMs: 2200,
        ssoSilentIframeDurationMs: 2000,
        ssoSilentTokenPostDurationMs: 200,
        ssoSilentOutcome: "failure",
        ssoSilentErrorCode: "post_request_failed",
      });
    });

    it("should handle failure without network start (iframe timeout)", () => {
      const error = Object.assign(new Error("monitor_window_timeout"), { errorCode: "monitor_window_timeout" });

      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_FAILURE, timestamp: 11000, error });

      expect(collector.get()).toEqual({
        ssoSilentTotalDurationMs: 10000,
        ssoSilentIframeDurationMs: null,
        ssoSilentTokenPostDurationMs: null,
        ssoSilentOutcome: "failure",
        ssoSilentErrorCode: "monitor_window_timeout",
      });
    });

    it("should handle success without network start event", () => {
      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_SUCCESS, timestamp: 2000 });

      expect(collector.get()).toEqual({
        ssoSilentTotalDurationMs: 1000,
        ssoSilentIframeDurationMs: null,
        ssoSilentTokenPostDurationMs: null,
        ssoSilentOutcome: "success",
      });
    });

    it("should reset state between flows", () => {
      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_SUCCESS, timestamp: 2000 });

      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 5000 });
      capturedCallback({ eventType: EventType.ACQUIRE_TOKEN_NETWORK_START, timestamp: 6000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_SUCCESS, timestamp: 6500 });

      expect(collector.get()).toMatchObject({
        ssoSilentTotalDurationMs: 1500,
        ssoSilentIframeDurationMs: 1000,
        ssoSilentTokenPostDurationMs: 500,
        ssoSilentOutcome: "success",
      });
    });
  });

  describe("loginPopup flow", () => {
    it("should collect popup timing on success", () => {
      capturedCallback({ eventType: EventType.LOGIN_START, timestamp: 5000 });
      capturedCallback({ eventType: EventType.POPUP_OPENED, timestamp: 5200 });
      capturedCallback({ eventType: EventType.LOGIN_SUCCESS, timestamp: 9000 });

      expect(collector.get()).toEqual({
        popupOpenedDelayMs: 200,
        loginPopupDurationMs: 4000,
        loginPopupOutcome: "success",
      });
    });

    it("should collect popup timing on failure", () => {
      const error = Object.assign(new Error("user_cancelled"), { errorCode: "user_cancelled" });

      capturedCallback({ eventType: EventType.LOGIN_START, timestamp: 5000 });
      capturedCallback({ eventType: EventType.POPUP_OPENED, timestamp: 5100 });
      capturedCallback({ eventType: EventType.LOGIN_FAILURE, timestamp: 7000, error });

      expect(collector.get()).toEqual({
        popupOpenedDelayMs: 100,
        loginPopupDurationMs: 2000,
        loginPopupOutcome: "failure",
        loginPopupErrorCode: "user_cancelled",
      });
    });

    it("should handle login failure without popup opened event", () => {
      const error = Object.assign(new Error("popup_window_error"), { errorCode: "popup_window_error" });

      capturedCallback({ eventType: EventType.LOGIN_START, timestamp: 5000 });
      capturedCallback({ eventType: EventType.LOGIN_FAILURE, timestamp: 5050, error });

      expect(collector.get()).toEqual({
        loginPopupDurationMs: 50,
        loginPopupOutcome: "failure",
        loginPopupErrorCode: "popup_window_error",
      });
    });
  });

  describe("combined ssoSilent then popup fallback", () => {
    it("should collect diagnostics from both flows", () => {
      // ssoSilent fails
      capturedCallback({ eventType: EventType.SSO_SILENT_START, timestamp: 1000 });
      capturedCallback({ eventType: EventType.SSO_SILENT_FAILURE, timestamp: 11000, error: Object.assign(new Error("monitor_window_timeout"), { errorCode: "monitor_window_timeout" }) });

      // popup fallback succeeds
      capturedCallback({ eventType: EventType.LOGIN_START, timestamp: 11100 });
      capturedCallback({ eventType: EventType.POPUP_OPENED, timestamp: 11300 });
      capturedCallback({ eventType: EventType.LOGIN_SUCCESS, timestamp: 14000 });

      expect(collector.get()).toEqual({
        ssoSilentTotalDurationMs: 10000,
        ssoSilentIframeDurationMs: null,
        ssoSilentTokenPostDurationMs: null,
        ssoSilentOutcome: "failure",
        ssoSilentErrorCode: "monitor_window_timeout",
        popupOpenedDelayMs: 200,
        loginPopupDurationMs: 2900,
        loginPopupOutcome: "success",
      });
    });
  });
});
