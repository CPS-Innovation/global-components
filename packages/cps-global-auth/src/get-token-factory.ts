import { PublicClientApplication, SilentRequest } from "@azure/msal-browser";
import { makeConsole, withLogging } from "./internal/logging";
import { GetToken } from "./GetToken";

const { _error } = makeConsole("getTokenFactory");

const getTokenFactoryInternal =
  ({ instance }: { instance: PublicClientApplication }): GetToken =>
  async ({ config: { AD_GATEWAY_SCOPE } }) => {
    if (!AD_GATEWAY_SCOPE) return null;
    const request = {
      scopes: [AD_GATEWAY_SCOPE],
    } as SilentRequest;

    try {
      const { accessToken } = await instance.acquireTokenSilent(request);
      return accessToken;
    } catch (error) {
      _error(error);
      return null;
    }
  };

export const getTokenFactory = withLogging("getTokenFactory", getTokenFactoryInternal);
