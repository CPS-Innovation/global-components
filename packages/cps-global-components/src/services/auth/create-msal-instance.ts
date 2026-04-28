import { LogLevel, PublicClientApplication } from "@azure/msal-browser";
import { makeConsole } from "../../logging/makeConsole";

type Props = { authority: string; clientId: string; redirectUri: string };

const { _debug, _warn, _error } = makeConsole("createMsalInstance");

export const createMsalInstance = async ({ authority, clientId, redirectUri }: Props) => {
  const instance = new PublicClientApplication({
    auth: { authority, clientId, redirectUri },
    cache: {
      // Note: no strong reason for choosing localStorage other than we are in a world
      //  where we are skipping around different apps, and possibly different tabs.
      cacheLocation: "localStorage",
    },
    system: {
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

  // FCT2-14290: handleRedirectPromise() was added here to clear dirty interaction_in_progress
  //  flags left by aborted auth flows. However, as a guest component on host app pages, this
  //  picks up and tries to process redirect state from the HOST APP's own MSAL flows (same
  //  tenant, different client ID), causing AADSTS50196 redirect loops. Needs guards to check
  //  that any pending redirect state belongs to our client ID before calling. Parked for now.

  return instance;
};
