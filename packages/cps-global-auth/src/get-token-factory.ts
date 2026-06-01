import { PublicClientApplication, SilentRequest } from "@azure/msal-browser";
import { GetToken } from "./GetToken";
import { LogError } from "./LogError";

export const getTokenFactory =
  ({ instance, logError }: { instance: PublicClientApplication; logError: LogError }): GetToken =>
  async ({ config: { AD_GATEWAY_SCOPES } }) => {
    if (AD_GATEWAY_SCOPES.length === 0) return null;
    // Guard: with no active account, acquireTokenSilent throws no_account_error.
    // That happens routinely — a data call fires while the user is mid-redirect
    // or auth hasn't established an account yet. Returning null here (the same
    // outcome as the catch) skips the throw so we don't log thousands of
    // expected "errors" to telemetry. The call will 401, which it would anyway
    // when unauthed.
    if (!instance.getActiveAccount()) return null;
    const request: SilentRequest = { scopes: AD_GATEWAY_SCOPES };

    try {
      const { accessToken } = await instance.acquireTokenSilent(request);
      return accessToken;
    } catch (error) {
      logError("getToken acquireTokenSilent failed", error);
      return null;
    }
  };
