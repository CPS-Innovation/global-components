import { EventType, type PublicClientApplication } from "@azure/msal-browser";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

export const registerMsalDiagnosticEvents = (
  instance: PublicClientApplication,
  collector: AdDiagnosticsCollector,
): void => {
  let ssoSilentStart: number | null = null;
  let networkStart: number | null = null;
  let loginPopupStart: number | null = null;

  instance.addEventCallback(
    (message) => {
      const { eventType, timestamp, error } = message;

      switch (eventType) {
        case EventType.SSO_SILENT_START: {
          ssoSilentStart = timestamp;
          networkStart = null;
          break;
        }

        case EventType.ACQUIRE_TOKEN_NETWORK_START: {
          networkStart = timestamp;
          break;
        }

        case EventType.SSO_SILENT_SUCCESS:
        case EventType.SSO_SILENT_FAILURE: {
          const outcome = eventType === EventType.SSO_SILENT_SUCCESS ? "success" : "failure";
          collector.add({
            ssoSilentTotalDurationMs: ssoSilentStart != null ? timestamp - ssoSilentStart : null,
            ssoSilentIframeDurationMs: ssoSilentStart != null && networkStart != null ? networkStart - ssoSilentStart : null,
            ssoSilentTokenPostDurationMs: networkStart != null ? timestamp - networkStart : null,
            ssoSilentOutcome: outcome,
            ...(outcome === "failure" && {
              ssoSilentErrorCode: (error as Error & { errorCode?: string })?.errorCode ?? null,
            }),
          });
          ssoSilentStart = null;
          networkStart = null;
          break;
        }

        case EventType.LOGIN_START: {
          loginPopupStart = timestamp;
          break;
        }

        case EventType.POPUP_OPENED: {
          collector.add({
            popupOpenedDelayMs: loginPopupStart != null ? timestamp - loginPopupStart : null,
          });
          break;
        }

        case EventType.LOGIN_SUCCESS:
        case EventType.LOGIN_FAILURE: {
          const popupOutcome = eventType === EventType.LOGIN_SUCCESS ? "success" : "failure";
          collector.add({
            loginPopupDurationMs: loginPopupStart != null ? timestamp - loginPopupStart : null,
            loginPopupOutcome: popupOutcome,
            ...(popupOutcome === "failure" && {
              loginPopupErrorCode: (error as Error & { errorCode?: string })?.errorCode ?? null,
            }),
          });
          loginPopupStart = null;
          break;
        }
      }
    },
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
};
