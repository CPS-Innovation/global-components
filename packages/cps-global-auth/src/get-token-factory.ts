import { PublicClientApplication, SilentRequest } from "@azure/msal-browser";
import { GetToken } from "./GetToken";
import { LogError } from "./LogError";

export const getTokenFactory =
  ({ instance, logError }: { instance: PublicClientApplication; logError: LogError }): GetToken =>
  async ({ config: { AD_GATEWAY_SCOPES } }) => {
    if (AD_GATEWAY_SCOPES.length === 0) return null;
    const request: SilentRequest = { scopes: AD_GATEWAY_SCOPES };

    try {
      const { accessToken } = await instance.acquireTokenSilent(request);
      return accessToken;
    } catch (error) {
      logError("getToken acquireTokenSilent failed", error);
      return null;
    }
  };
