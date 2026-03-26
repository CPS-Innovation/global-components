import { EventType, type PublicClientApplication } from "@azure/msal-browser";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

export const registerMsalDiagnosticEvents = (
  instance: PublicClientApplication,
  collector: AdDiagnosticsCollector,
): void => {
  let flowStart: number | null = null;
  let networkStart: number | null = null;

  instance.addEventCallback(
    (message) => {
      const { eventType, timestamp, error } = message;

      switch (eventType) {
        case EventType.SSO_SILENT_START: {
          flowStart = timestamp;
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
            ssoSilentTotalDurationMs: flowStart != null ? timestamp - flowStart : null,
            ssoSilentIframeDurationMs: flowStart != null && networkStart != null ? networkStart - flowStart : null,
            ssoSilentTokenPostDurationMs: networkStart != null ? timestamp - networkStart : null,
            ssoSilentOutcome: outcome,
            ...(outcome === "failure" && {
              ssoSilentErrorCode: (error as Error & { errorCode?: string })?.errorCode ?? null,
            }),
          });
          flowStart = null;
          networkStart = null;
          break;
        }
      }
    },
    [
      EventType.SSO_SILENT_START,
      EventType.SSO_SILENT_SUCCESS,
      EventType.SSO_SILENT_FAILURE,
      EventType.ACQUIRE_TOKEN_NETWORK_START,
    ],
  );
};
