import { PublicClientApplication, SilentRequest } from "@azure/msal-browser";
import { withLogging } from "../../logging/with-logging";
import { _console } from "../../logging/_console";
import { GetToken } from "./GetToken";

const getTokenFactoryInternal =
  ({ instance }: { instance: PublicClientApplication }): GetToken =>
  async ({ config: { AD_GATEWAY_SCOPE } }: { config: { AD_GATEWAY_SCOPE: string } }) => {
    const request = {
      scopes: [AD_GATEWAY_SCOPE],
    } as SilentRequest;

    try {
      const { accessToken } = await instance.acquireTokenSilent(request);
      return accessToken;
    } catch (error) {
      _console.error(error);
      return null;
    }
  };

export const getTokenFactory = withLogging("getTokenFactory", getTokenFactoryInternal);
