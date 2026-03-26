import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";
import { createDiagnosticNetworkClient } from "./diagnostic-network-client";
import { registerMsalDiagnosticEvents } from "./register-msal-diagnostic-events";
import type { AdDiagnosticsCollector } from "./ad-diagnostics-collector";

type Props = { authority: string; clientId: string; redirectUri: string; diagnosticsCollector?: AdDiagnosticsCollector };

const { _debug, _warn, _error } = makeConsole("createMsalInstance");

export const createMsalInstance = async ({ authority, clientId, redirectUri, diagnosticsCollector }: Props) => {
  const instance = new PublicClientApplication({
    auth: {
      authority,
      clientId,
      redirectUri,
    },

    cache: {
      // Note: no strong reason for choosing localStorage other than we are in a world
      //  where we are skipping around different apps, and possibly different tabs.
      cacheLocation: "localStorage",
    },
    system: {
      ...(diagnosticsCollector && { networkClient: createDiagnosticNetworkClient(diagnosticsCollector) }),
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          const logFn = level === LogLevel.Error ? _error : level === LogLevel.Warning ? _warn : _debug;
          logFn("MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

  await instance.initialize();

  if (diagnosticsCollector) {
    registerMsalDiagnosticEvents(instance, diagnosticsCollector);
  }

  return instance;
};
