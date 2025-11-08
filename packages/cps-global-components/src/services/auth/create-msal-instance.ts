import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { _console } from "../../logging/_console";

type Props = { authority: string; clientId: string; redirectUri: string };

export const createMsalInstance = async ({ authority, clientId, redirectUri }: Props) => {
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
      loggerOptions: {
        loggerCallback: (level, message, containsPii) => {
          const logFn = level === LogLevel.Error ? _console.error : level === LogLevel.Warning ? _console.warn : _console.debug;
          logFn("getAdUserAccount", "MSAL logging", level, message, containsPii);
        },
        logLevel: LogLevel.Verbose,
      },
    },
  });

  await instance.initialize();

  return instance;
};
